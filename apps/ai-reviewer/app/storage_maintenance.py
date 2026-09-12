"""Restart-safe notices and expiry cleanup in the application's single worker."""
import json
import logging
import os
import threading
import time

from fastapi import HTTPException

LOG = logging.getLogger(__name__)


def maintenance_enabled():
    return os.getenv('STORAGE_MAINTENANCE_ENABLED', 'true').lower() == 'true'


class StorageMaintenance:
    def __init__(self, database, storage, mail):
        self.db, self.storage, self.mail = database, storage, mail
        self.stop_event, self.run_lock = threading.Event(), threading.Lock()
        self.thread = None

    def start(self):
        self.stop_event.clear()
        with self.db.connect() as c:
            c.execute('UPDATE storage_subscriptions SET cleanup_busy=0')
            c.execute("UPDATE storage_email_outbox SET status='pending' WHERE status='sending'")
        if maintenance_enabled():
            self.thread = threading.Thread(target=self.loop, name='storage-maintenance', daemon=True)
            self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join()
            self.thread = None

    def loop(self):
        while not self.stop_event.wait(60):
            try:
                self.run_once()
            except Exception:
                LOG.exception('Storage maintenance cycle failed')

    def enqueue(self):
        now = int(time.time())
        with self.db.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            rows = c.execute('SELECT user_id FROM storage_subscriptions').fetchall()
            for row in rows:
                sub = self.db.subscription(row['user_id'], c)
                kind = 'expired' if sub['expired'] else 'reminder' if sub['expires_at'] - now <= 3 * 86400 else None
                kinds = [kind] if kind else []
                if sub['expired'] and sub['warning_sent_at'] and sub['delete_after'] - now <= 86400:
                    if self.db.storage_usage(row['user_id'], c)['over_quota']:
                        kinds.append('last_call')
                for kind in kinds:
                    c.execute('INSERT OR IGNORE INTO storage_email_outbox(user_id,cycle,kind) VALUES(?,?,?)',
                              (row['user_id'], sub['expires_at'], kind))
            # A renewal invalidates unsent reminders for the old expiry, never confirmations of actual deletion.
            c.execute("""UPDATE storage_email_outbox SET status='suppressed' WHERE status='pending' AND kind!='deleted'
                AND cycle!=(SELECT expires_at FROM storage_subscriptions WHERE user_id=storage_email_outbox.user_id)""")

    def send_pending(self):
        now = int(time.time())
        with self.db.connect() as c:
            ids = [r['id'] for r in c.execute("SELECT id FROM storage_email_outbox WHERE status='pending' AND next_attempt<=? ORDER BY id LIMIT 100", (now,))]
        for item_id in ids:
            if self.stop_event.is_set():
                return
            with self.db.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                item = dict(c.execute('SELECT * FROM storage_email_outbox WHERE id=?', (item_id,)).fetchone())
                if item['status'] != 'pending':
                    continue
                sub = self.db.subscription(item['user_id'], c)
                if item['kind'] != 'deleted' and item['cycle'] != sub['expires_at']:
                    c.execute("UPDATE storage_email_outbox SET status='suppressed' WHERE id=?", (item_id,))
                    continue
                if item['kind'] == 'reminder' and sub['expired']:
                    c.execute("UPDATE storage_email_outbox SET status='suppressed' WHERE id=?", (item_id,))
                    continue
                user = dict(c.execute('SELECT id,email,credits FROM users WHERE id=?', (item['user_id'],)).fetchone())
                usage = self.db.storage_usage(item['user_id'], c)
                if item['kind'] == 'last_call' and not usage['over_quota']:
                    c.execute("UPDATE storage_email_outbox SET status='suppressed' WHERE id=?", (item_id,))
                    continue
                deleted = c.execute('SELECT COUNT(*) FROM storage_cleanup_log WHERE user_id=? AND cycle=?', (item['user_id'], item['cycle'])).fetchone()[0]
                c.execute("UPDATE storage_email_outbox SET status='sending',attempts=attempts+1 WHERE id=?", (item_id,))
            try:
                self.mail.send_notice(item, sub, usage, user, deleted)
            except Exception:
                retry = min(3600, 60 * 2 ** min(item['attempts'], 6))
                with self.db.connect() as c:
                    c.execute("UPDATE storage_email_outbox SET status='pending',next_attempt=?,error='SMTP chưa gửi được; sẽ thử lại' WHERE id=?",
                              (int(time.time()) + retry, item_id))
            else:
                with self.db.connect() as c:
                    c.execute("UPDATE storage_email_outbox SET status='sent',sent_at=?,error='' WHERE id=?", (int(time.time()), item_id))
                    if item['kind'] in {'reminder', 'expired'}:
                        c.execute('''UPDATE storage_subscriptions SET warning_sent_at=COALESCE(warning_sent_at,?)
                                     WHERE user_id=? AND expires_at=?''', (int(time.time()), item['user_id'], item['cycle']))

    def cleanup_user(self, user_id):
        now = int(time.time())
        with self.db.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            sub = self.db.subscription(user_id, c)
            if not sub['expired'] or not sub['warning_sent_at'] or sub['delete_after'] > now or sub['cleanup_busy']:
                return
            if not self.db.storage_usage(user_id, c)['over_quota']:
                return
            if c.execute('SELECT 1 FROM papers WHERE owner_id=? AND deletion_pending=1 AND deletion_cycle IS NULL', (user_id,)).fetchone():
                return
            c.execute('UPDATE storage_subscriptions SET cleanup_busy=1 WHERE user_id=?', (user_id,))
        try:
            # Renewal checks cleanup_busy in its debit transaction. Stop after the account fits,
            # and re-evaluate after every completed deletion instead of deleting an obsolete list.
            while not self.stop_event.is_set():
                with self.db.connect() as c:
                    candidates = self.db.expiry_candidates(user_id, c)
                if not candidates:
                    break
                candidate = candidates[0]
                try:
                    self.storage.delete_paper(candidate['id'], user_id, expiry_cycle=sub['expires_at'])
                except HTTPException:
                    # Preserve oldest-first ordering; a busy/failed older paper must not cause deletion of newer papers.
                    break
        finally:
            with self.db.connect() as c:
                c.execute('UPDATE storage_subscriptions SET cleanup_busy=0 WHERE user_id=?', (user_id,))
                if c.execute('SELECT 1 FROM storage_cleanup_log WHERE user_id=? AND cycle=?', (user_id, sub['expires_at'])).fetchone():
                    if not self.db.storage_usage(user_id, c)['over_quota']:
                        c.execute("INSERT OR IGNORE INTO storage_email_outbox(user_id,cycle,kind) VALUES(?,?,'deleted')", (user_id, sub['expires_at']))

    def run_once(self):
        if not self.run_lock.acquire(blocking=False):
            return
        try:
            self.enqueue()
            self.send_pending()
            with self.db.connect() as c:
                users = [r['user_id'] for r in c.execute('SELECT user_id FROM storage_subscriptions WHERE expires_at<=?', (int(time.time()),))]
            for user_id in users:
                if self.stop_event.is_set():
                    break
                self.cleanup_user(user_id)
            with self.db.connect() as c:
                c.execute("INSERT INTO settings(key,value) VALUES('storage_maintenance_last_run',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                          (json.dumps(int(time.time())),))
        finally:
            self.run_lock.release()

    def status(self):
        with self.db.connect() as c:
            counts = {r['status']: r['n'] for r in c.execute('SELECT status,COUNT(*) n FROM storage_email_outbox GROUP BY status')}
            failed = c.execute("SELECT COUNT(*) FROM storage_email_outbox WHERE error!='' AND status='pending'").fetchone()[0]
        return {'enabled': maintenance_enabled(), 'last_run': self.db.settings_values().get('storage_maintenance_last_run'),
                'mail_counts': counts, 'mail_failures': failed}
