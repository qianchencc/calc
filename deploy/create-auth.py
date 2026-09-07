"""Provision a separate read-only API secret once; never print it."""
import os
from pathlib import Path
import secrets

key_path = Path('/opt/calc-usage/api-key')
if not key_path.exists():
    fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write(secrets.token_hex(32))
key = key_path.read_text().strip()
if len(key) != 64 or any(c not in '0123456789abcdef' for c in key):
    raise ValueError('Invalid API key file')
path = Path('/opt/sub2api-deploy/data/pages/assets/calc-private/auth.conf')
path.write_text('if ($http_authorization != "Bearer ' + key + '") { return 401; }\n')
path.chmod(0o600)
