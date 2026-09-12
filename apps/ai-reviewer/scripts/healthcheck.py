"""No authentication or secrets in the healthcheck output."""
import json
import os
import urllib.request

with urllib.request.urlopen('http://127.0.0.1:' + os.getenv('REVIEW_APP_PORT', '8000') + '/api/health', timeout=3) as response:
    if response.status != 200 or json.load(response).get('status') != 'ok':
        raise SystemExit(1)
