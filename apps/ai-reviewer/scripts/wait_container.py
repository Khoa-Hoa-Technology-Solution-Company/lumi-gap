"""CI only: wait up to 90 seconds for a disposable container to become healthy."""
import json
import subprocess
import sys
import time

name = sys.argv[1]
for _ in range(45):
    result = subprocess.run(['docker', 'inspect', name], check=True, capture_output=True, text=True)
    state = json.loads(result.stdout)[0]['State']
    if state.get('Health', {}).get('Status') == 'healthy':
        print('Runtime container healthy')
        break
    if not state.get('Running') or state.get('Health', {}).get('Status') == 'unhealthy':
        raise SystemExit('Runtime container failed to start or is unhealthy')
    time.sleep(2)
else:
    raise SystemExit('Runtime healthcheck timed out')
