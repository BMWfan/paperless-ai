#!/usr/bin/env python3
"""Check the local Ollama manifest against a frozen approved model digest."""
import hashlib
import json
from pathlib import Path
import sys
locks = json.loads(Path(__file__).with_name('model-locks.json').read_text())
model = sys.argv[1]
assert model in locks
manifest = Path('/tmp/extraction-manifest.json').read_bytes()
assert hashlib.sha256(manifest).hexdigest() == locks[model], 'Model manifest changed; do not infer'
print('Approved model manifest verified:', model)
