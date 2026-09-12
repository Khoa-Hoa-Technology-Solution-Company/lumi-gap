"""Managed files with local fallback and retryable permanent deletion."""
import hashlib
import logging
import os
import shutil
import tempfile
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

import google.auth
from google.auth.transport.requests import AuthorizedSession
from fastapi import HTTPException

LOG = logging.getLogger(__name__)
DRIVE_API = 'https://www.googleapis.com/drive/v3'


class Drive:
    def __init__(self):
        filename = os.getenv('SYSTEM_DRIVE_CREDENTIALS_FILE', '')
        if not filename:
            raise RuntimeError('SYSTEM_DRIVE_CREDENTIALS_FILE chưa cấu hình')
        credentials, _ = google.auth.load_credentials_from_file(filename, scopes=['https://www.googleapis.com/auth/drive'])
        self.session = AuthorizedSession(credentials)

    def close(self):
        self.session.close()

    def folder(self, folder_id):
        response = self.session.get(f'{DRIVE_API}/files/{folder_id}', params={
            'supportsAllDrives': 'true', 'fields': 'id,name,mimeType,driveId,ownedByMe,capabilities(canAddChildren,canDeleteChildren)'}, timeout=20)
        response.raise_for_status()
        folder = response.json()
        capabilities = folder.get('capabilities', {})
        can_delete = capabilities.get('canDeleteChildren') if folder.get('driveId') else folder.get('ownedByMe')
        if (folder.get('mimeType') != 'application/vnd.google-apps.folder'
                or not capabilities.get('canAddChildren') or not can_delete):
            raise RuntimeError('Thư mục cần quyền thêm và xóa vĩnh viễn file')
        return folder

    def allocate_id(self):
        response = self.session.get(f'{DRIVE_API}/files/generateIds', params={'count': 1, 'space': 'drive', 'type': 'files'}, timeout=20)
        response.raise_for_status()
        return response.json()['ids'][0]

    def upload(self, path, file_id, folder_id, checksum):
        params = {'supportsAllDrives': 'true', 'fields': 'id,size,sha256Checksum,trashed'}
        previous = self.session.get(f'{DRIVE_API}/files/{file_id}', params=params, timeout=20)
        if previous.status_code == 404:
            response = self.session.post('https://www.googleapis.com/upload/drive/v3/files',
                params={**params, 'uploadType': 'resumable'},
                json={'id': file_id, 'name': path.name, 'parents': [folder_id]},
                headers={'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': str(path.stat().st_size)}, timeout=20)
            response.raise_for_status()
            location = response.headers['Location']
            parsed = urlparse(location)
            if parsed.scheme != 'https' or parsed.netloc != 'www.googleapis.com':
                raise RuntimeError('Địa chỉ phiên upload không hợp lệ')
            with path.open('rb') as content:
                response = self.session.put(location, data=content, headers={'Content-Type': 'application/octet-stream'}, timeout=60)
            response.raise_for_status()
            metadata = response.json()
        else:
            previous.raise_for_status()
            metadata = previous.json()
        if (metadata.get('trashed') or int(metadata.get('size', -1)) != path.stat().st_size
                or metadata.get('sha256Checksum') != checksum):
            raise RuntimeError('Không xác nhận được toàn vẹn file trên Drive; giữ bản local')

    def download(self, file_id, destination, size, checksum):
        digest, received = hashlib.sha256(), 0
        with self.session.get(f'{DRIVE_API}/files/{file_id}', params={'alt': 'media', 'supportsAllDrives': 'true'},
                              stream=True, timeout=60) as response:
            response.raise_for_status()
            with destination.open('wb') as output:
                for chunk in response.iter_content(1024 * 1024):
                    received += len(chunk)
                    if received > size:
                        raise RuntimeError('File Drive khác dung lượng đã lưu')
                    digest.update(chunk)
                    output.write(chunk)
        if received != size or (checksum and digest.hexdigest() != checksum):
            raise RuntimeError('File Drive không khớp checksum')

    def delete(self, file_id):
        response = self.session.delete(f'{DRIVE_API}/files/{file_id}', params={'supportsAllDrives': 'true'}, timeout=20)
        if response.status_code != 404:
            response.raise_for_status()


class Storage:
    def __init__(self, database, upload_root, output_root):
        self.db = database
        self.upload_root, self.output_root = upload_root, output_root
        # Fixed stripes avoid an unbounded lock dictionary. Single process is enforced at startup.
        self.locks = [threading.RLock() for _ in range(64)]

    def lock(self, paper_id):
        return self.locks[paper_id % len(self.locks)]

    def safe_path(self, path, kind):
        path = Path(os.path.abspath(path))
        root = Path(self.upload_root() if kind == 'pdf' else self.output_root()).resolve()
        if not path.is_relative_to(root) or path == root:
            raise RuntimeError('File ngoài thư mục do hệ thống quản lý')
        for part in [path, *path.parents]:
            if part == root:
                break
            if part.is_symlink():
                raise RuntimeError('Không thao tác trên liên kết tượng trưng')
        return path

    def register(self, paper_id, path, kind, review_id=None):
        # Legacy paths are recorded even when outside managed roots, but never deleted or moved there.
        path = Path(path).absolute()
        if not path.is_file() or path.is_symlink():
            return
        with self.db.connect() as c:
            existing = c.execute('SELECT paper_id FROM stored_files WHERE local_path=?', (str(path),)).fetchone()
            if existing and existing['paper_id'] != paper_id:
                raise RuntimeError('File được tham chiếu bởi nhiều bài báo; cần quản trị viên xử lý')
            c.execute('INSERT OR IGNORE INTO stored_files(paper_id,review_id,kind,local_path,size) VALUES(?,?,?,?,?)',
                      (paper_id, review_id, kind, str(path), path.stat().st_size))

    def register_outputs(self, paper_id, review_id, directory):
        if not directory:
            return
        root = self.safe_path(directory, 'artifact')
        if not root.exists():
            return
        for path in root.rglob('*'):
            self.safe_path(path, 'artifact')
            if path.is_file():
                self.register(paper_id, path, 'artifact', review_id)

    def reconcile(self):
        with self.db.connect() as c:
            reservations = [dict(r) for r in c.execute('SELECT * FROM upload_reservations')]
        for reservation in reservations:
            try:
                if reservation['local_path']:
                    self.safe_path(reservation['local_path'], 'pdf').unlink(missing_ok=True)
                self.db.release_upload(reservation['token'])
            except (OSError, RuntimeError):
                LOG.warning('Interrupted upload needs cleanup for user %s', reservation['user_id'])
        with self.db.connect() as c:
            # Jobs do not survive process restarts; reservations/busy flags do not either.
            c.execute('UPDATE papers SET storage_busy=0')
            papers = [dict(r) for r in c.execute('SELECT * FROM papers')]
            reviews = [dict(r) for r in c.execute("SELECT id,paper_id,output_dir FROM reviews WHERE output_dir!=''")]
        for paper in papers:
            self.register(paper['id'], paper['file_path'], 'pdf')
            # Refresh legacy PDFs' sizes without treating a migrated remote PDF as zero bytes.
            original = Path(paper['file_path'])
            if original.is_file() and not original.is_symlink():
                with self.db.connect() as c:
                    c.execute('UPDATE papers SET file_size=? WHERE id=?', (original.stat().st_size, paper['id']))
        for review in reviews:
            try:
                self.register_outputs(review['paper_id'], review['id'], review['output_dir'])
            except RuntimeError:
                LOG.warning('Review %s has files requiring manual storage reconciliation', review['id'])

    def files(self, paper_id):
        with self.db.connect() as c:
            return [dict(r) for r in c.execute('SELECT * FROM stored_files WHERE paper_id=? ORDER BY id', (paper_id,))]

    @contextmanager
    def materialize(self, paper_id, snapshot=False):
        # A temporary snapshot allows a download to finish even if the user subsequently deletes the paper.
        with tempfile.TemporaryDirectory(prefix='lrp-read-') as directory:
            with self.lock(paper_id):
                paper = self.db.get_paper(paper_id)
                if not paper:
                    raise HTTPException(404, 'Không tìm thấy bài báo')
                if paper['deletion_pending']:
                    raise HTTPException(409, 'Bài báo đang chờ hoàn tất xóa')
                if snapshot:
                    self.db.assert_storage_access(paper['owner_id'])
                records = [f for f in self.files(paper_id) if f['kind'] == 'pdf']
                record = records[0] if records else None
                path = Path(directory) / Path(paper['file_path']).name
                if record and record['backend'] == 'drive':
                    drive = Drive()
                    try:
                        drive.download(record['drive_id'], path, record['size'], record['sha256'])
                    finally:
                        drive.close()
                else:
                    # Existing imports may reference a PDF outside uploads; reads preserve that compatibility.
                    source = Path(paper['file_path'])
                    if not source.is_file():
                        raise HTTPException(404, 'File PDF không còn tồn tại')
                    if snapshot:
                        shutil.copyfile(source, path)
                    else:
                        path = source
            yield path

    def archive(self, paper_id, force=False):
        """A saved remote ID makes uncertain uploads retryable without creating duplicates."""
        with self.lock(paper_id):
            policy = self.db.storage_policy()
            if not force and policy['storage_backend'] != 'drive':
                return True
            drive = None
            try:
                drive = Drive()
                for record in self.files(paper_id):
                    if record['deleted']:
                        continue
                    path = self.safe_path(record['local_path'], record['kind'])
                    if record['backend'] == 'drive':
                        # Crash after committing the remote location but before removing the local copy.
                        if path.exists():
                            drive.upload(path, record['drive_id'], record['drive_folder_id'], record['sha256'])
                            path.unlink()
                        continue
                    with path.open('rb') as content:
                        checksum = hashlib.file_digest(content, 'sha256').hexdigest()
                    file_id = record['drive_id'] or drive.allocate_id()
                    folder_id = record['drive_folder_id'] or policy['drive_folder_id']
                    if not folder_id:
                        raise RuntimeError('Chưa chọn thư mục Drive')
                    with self.db.connect() as c:
                        c.execute('UPDATE stored_files SET drive_id=?,drive_folder_id=?,sha256=? WHERE id=?',
                                  (file_id, folder_id, checksum, record['id']))
                    drive.upload(path, file_id, folder_id, checksum)
                    with self.db.connect() as c:
                        c.execute("UPDATE stored_files SET backend='drive' WHERE id=?", (record['id'],))
                    path.unlink(missing_ok=True)
                with self.db.connect() as c:
                    c.execute("UPDATE papers SET storage_error='' WHERE id=?", (paper_id,))
                return True
            except Exception:
                # No secret/remote response details in public errors or logs.
                LOG.warning('Drive transfer pending for paper %s; local files retained', paper_id)
                with self.db.connect() as c:
                    c.execute("UPDATE papers SET storage_error='Chưa chuyển hết file lên Drive; bản local được giữ lại.' WHERE id=?", (paper_id,))
                return False
            finally:
                if drive:
                    drive.close()

    def delete_paper(self, paper_id, user_id, expiry_cycle=None):
        with self.lock(paper_id):
            with self.db.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                paper = c.execute('SELECT * FROM papers WHERE id=? AND owner_id=?', (paper_id, user_id)).fetchone()
                if not paper:
                    raise HTTPException(404, 'Không tìm thấy bài báo')
                if expiry_cycle is None and self.db.subscription(user_id, c)['cleanup_busy']:
                    raise HTTPException(409, 'Hệ thống đang dọn dữ liệu hết hạn. Vui lòng thử lại sau.')
                if expiry_cycle is not None:
                    sub = self.db.subscription(user_id, c)
                    candidates = self.db.expiry_candidates(user_id, c)
                    if (not sub['expired'] or sub['expires_at'] != expiry_cycle or not sub['cleanup_busy']
                            or not sub['warning_sent_at'] or sub['delete_after'] > int(time.time())
                            or not candidates or candidates[0]['id'] != paper_id):
                        raise HTTPException(409, 'Gói hoặc dung lượng đã thay đổi; dừng xóa tự động')
                busy = c.execute("SELECT 1 FROM reviews WHERE paper_id=? AND status IN ('queued','running')", (paper_id,)).fetchone()
                checking = c.execute("SELECT 1 FROM format_checks WHERE paper_id=? AND status IN ('queued','running')", (paper_id,)).fetchone()
                if busy or checking or paper['storage_busy']:
                    raise HTTPException(409, 'Bài báo đang được xử lý. Hãy chờ hoàn tất trước khi xóa.')
                c.execute('UPDATE papers SET deletion_pending=1,deletion_cycle=COALESCE(deletion_cycle,?) WHERE id=?', (expiry_cycle, paper_id))
                deletion_cycle = paper['deletion_cycle'] if paper['deletion_cycle'] is not None else expiry_cycle
                reviews = [dict(r) for r in c.execute('SELECT id,output_dir FROM reviews WHERE paper_id=?', (paper_id,))]
            drive, checked_folders = None, set()
            try:
                self.register(paper_id, paper['file_path'], 'pdf')
                for review in reviews:
                    self.register_outputs(paper_id, review['id'], review['output_dir'])
                records = self.files(paper_id)
                # Validate every local path before deleting anything.
                for record in records:
                    self.safe_path(record['local_path'], record['kind'])
                for record in records:
                    if record['deleted']:
                        continue
                    if record['drive_id']:
                        drive = drive or Drive()
                        if record['drive_folder_id'] not in checked_folders:
                            # A 404 can hide permission loss. Verify access to the original storage folder
                            # before accepting a missing child as an idempotent successful deletion.
                            drive.folder(record['drive_folder_id'])
                            checked_folders.add(record['drive_folder_id'])
                        drive.delete(record['drive_id'])
                    self.safe_path(record['local_path'], record['kind']).unlink(missing_ok=True)
                    with self.db.connect() as c:
                        c.execute('UPDATE stored_files SET deleted=1 WHERE id=?', (record['id'],))
                for review in reviews:
                    if review['output_dir']:
                        directory = self.safe_path(review['output_dir'], 'artifact')
                        if directory.exists():
                            # Never recursively delete an unregistered file or someone else's directory.
                            for child in sorted(directory.rglob('*'), key=lambda p: len(p.parts), reverse=True):
                                if child.is_dir():
                                    child.rmdir()
                            directory.rmdir()
                            try:
                                directory.parent.rmdir()
                            except OSError:
                                pass
                with self.db.connect() as c:
                    if deletion_cycle is not None:
                        size = paper['file_size'] + sum(r['size'] for r in records if r['kind'] == 'artifact')
                        c.execute('INSERT OR IGNORE INTO storage_cleanup_log(user_id,cycle,paper_id,bytes,deleted_at) VALUES(?,?,?,?,?)',
                                  (user_id, deletion_cycle, paper_id, size, int(time.time())))
                    c.execute('DELETE FROM papers WHERE id=? AND owner_id=?', (paper_id, user_id))
                return {'deleted': True, 'paper_id': paper_id}
            except HTTPException:
                raise
            except Exception:
                LOG.warning('Permanent deletion pending for paper %s', paper_id)
                raise HTTPException(503, 'Chưa xóa hết file. Dữ liệu vẫn được ghi nhận; bấm “Thử xóa lại”. Nếu vẫn lỗi, liên hệ admin kiểm tra Drive/quyền thư mục.') from None
            finally:
                if drive:
                    drive.close()
