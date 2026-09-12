"""Validate Compose using a temporary example env, never print resolved secrets."""
from pathlib import Path
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='paperscope-compose-') as temp:
    dest = Path(temp)
    (dest / '.env').write_bytes((root / '.env.example').read_bytes())
    (dest / 'docker-compose.yml').write_bytes((root / 'docker-compose.yml').read_bytes())
    env = {k: v for k, v in os.environ.items() if not k.startswith(('COMPOSE_', 'PAPERSCOPE_', 'SYSTEM_DRIVE_'))}
    subprocess.run(['docker', 'compose', '--project-directory', str(dest), '-f', str(dest / 'docker-compose.yml'),
                    '--env-file', str(dest / '.env'), 'config', '--quiet'], check=True, env=env)
    (dest / 'docker-compose.drive.yml').write_bytes((root / 'docker-compose.drive.yml').read_bytes())
    (dest / 'drive-test.json').write_text('{}')
    env['SYSTEM_DRIVE_CREDENTIALS_HOST_PATH'] = str(dest / 'drive-test.json')
    subprocess.run(['docker', 'compose', '--project-directory', str(dest), '-f', str(dest / 'docker-compose.yml'),
                    '-f', str(dest / 'docker-compose.drive.yml'), '--env-file', str(dest / '.env'),
                    'config', '--quiet'], check=True, env=env)
print('Compose base and Drive overlay configurations valid')
