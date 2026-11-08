#!/usr/bin/env python3
"""Prepare and test only the disposable paperless-ai-e2e stack on small runtimes."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PROJECT = 'paperless-ai-e2e'
APP = PROJECT + '-cloud-app:local'
RUNTIME = PROJECT + '_paperless-runtime'
PAPERLESS_VERSION = '3.4.2'
PAPERLESS_IMAGE = PROJECT + '-cloud-paperless:' + PAPERLESS_VERSION
CRANE_VERSION = 'v0.22.1'
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
COMPOSE = DOCKER + ['compose', '--project-name', PROJECT, '-f', 'docker-compose.test.yml', '-f', 'docker-compose.test-cloud.yml']


def run(command, capture=False, check=True):
    return subprocess.run(command, cwd=ROOT, env=ENV, check=check, text=True,
                          stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.PIPE if capture else None)


def image_id(image):
    result = run(DOCKER + ['image', 'inspect', '--format', '{{.Id}}', image], capture=True, check=False)
    return result.stdout.strip() if result.returncode == 0 else None


def cache_ids():
    result = run(DOCKER + ['buildx', 'du', '--format=json'], capture=True)
    return {json.loads(line)['ID'] for line in result.stdout.splitlines() if line.strip()}


def fingerprint():
    files = run(['git', 'ls-files', '-co', '--exclude-standard', '-z'], capture=True).stdout.split('\0')
    digest = hashlib.sha256()
    for name in sorted(set(files)):
        file = ROOT / name
        if name and not name.endswith('.md') and file.is_file():
            digest.update(name.encode()); digest.update(file.read_bytes())
    return digest.hexdigest()


def crane_path(args):
    if args.crane:
        return str(Path(args.crane).resolve())
    executable = CACHE / ('crane-' + CRANE_VERSION)
    if executable.exists():
        return str(executable)
    if platform.machine() not in ('x86_64', 'AMD64'):
        raise SystemExit('The compact workflow currently supports amd64; use the standard test stack on other platforms.')
    asset = 'go-containerregistry_Linux_x86_64.tar.gz'
    base = 'https://github.com/google/go-containerregistry/releases/download/' + CRANE_VERSION + '/'
    print('Downloading pinned crane release and verifying its published checksum.', flush=True)
    # urllib preserves inherited proxy and system CA trust. TLS verification stays enabled.
    with urllib.request.urlopen(base + 'checksums.txt', timeout=60) as response:
        checksums = response.read().decode()
    expected = next((line.split()[0] for line in checksums.splitlines() if line.split() and line.split()[-1].lstrip('*') == asset), None)
    with urllib.request.urlopen(base + asset, timeout=60) as response:
        archive = response.read()
    if not expected or hashlib.sha256(archive).hexdigest() != expected:
        raise SystemExit('crane checksum verification failed')
    with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
        member = bundle.getmember('crane')
        executable.write_bytes(bundle.extractfile(member).read())
    executable.chmod(0o700)
    return str(executable)


def prepare(args):
    branch = run(['git', 'branch', '--show-current'], capture=True).stdout.strip()
    if not branch or branch == 'main':
        raise SystemExit('Use the approved development branch.')
    volume_exists = run(DOCKER + ['volume', 'inspect', RUNTIME], capture=True, check=False).returncode == 0
    paperless_exists = bool(image_id(PAPERLESS_IMAGE))
    if volume_exists and not paperless_exists:
        raise SystemExit(f'Paperless program volume exists without {PAPERLESS_IMAGE}. Stop the stack and explicitly remove only the test program volume before preparing again.')
    if paperless_exists and not volume_exists:
        raise SystemExit(f'Paperless program volume is missing. Stop the stack and remove only {PAPERLESS_IMAGE} before preparing again.')
    manifest_file = CACHE / 'prepared.json'
    manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    current = fingerprint()
    if manifest.get('fingerprint') != current or manifest.get('image') != image_id(APP):
        # Stop only this stack before replacing its app image; preserve test data.
        run(COMPOSE + ['down', '--remove-orphans'])
        if shutil.disk_usage(ROOT).free < 3 * 1024**3:
            raise SystemExit('At least 3 GiB free is needed for a fresh app build. Inspect task-owned disk use; no broad cleanup is performed.')
        before = cache_ids()
        run(DOCKER + ['compose', '--project-name', PROJECT, '-f', 'docker-compose.test.yml', 'build', 'ai'])
        created = cache_ids() - before
        old_image = image_id(APP)
        run([sys.executable, 'tests/e2e/compact-image.py', PROJECT + '-ai', APP])
        run(DOCKER + ['image', 'rm', PROJECT + '-ai'])
        if old_image and old_image != image_id(APP):
            # Never force removal of an image still referenced by another container.
            run(DOCKER + ['image', 'rm', old_image], check=False)
        if created:
            # Only cache entries created by this build; pre-existing cache is untouched.
            expression = '^(' + '|'.join(re.escape(value) for value in sorted(created)) + ')$'
            run(DOCKER + ['buildx', 'prune', '--all', '--force', '--filter', 'id=' + expression])
        manifest_file.write_text(json.dumps({'fingerprint': current, 'image': image_id(APP)}))
    remote = [
        ('registry-1.docker.io/library/redis:7.4.2-alpine', PROJECT + '-cloud-redis:local'),
        ('registry-1.docker.io/library/postgres:16.6-alpine', PROJECT + '-cloud-db:local'),
        ('ghcr.io/paperless-ngx/paperless-ngx:' + PAPERLESS_VERSION, PAPERLESS_IMAGE)
    ]
    crane = None
    for source, target in remote:
        is_paperless = target == PAPERLESS_IMAGE
        if image_id(target):
            continue
        crane = crane or crane_path(args)
        command = [sys.executable, 'tests/e2e/compact-image.py', '--remote', '--crane', crane]
        if is_paperless:
            command += ['--usr-volume', RUNTIME]
        run(command + [source, target])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare','start','test','reset','stop','status'])
    parser.add_argument('--crane', help='optional existing crane executable')
    parser.add_argument('--cache-dir', type=Path, default=ROOT / '.e2e-cache')
    args = parser.parse_args()
    global CACHE, ENV
    CACHE = args.cache_dir.resolve(); CACHE.mkdir(parents=True,exist_ok=True)
    ENV = os.environ.copy()
    for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:
        ENV.pop(key,None)
    ENV.pop('COMPOSE_PROFILES',None)
    ENV['BUILDX_CONFIG'] = str(CACHE / 'buildx')
    ENV['COMPOSE_BAKE'] = 'false'
    Path(ENV['BUILDX_CONFIG']).mkdir(exist_ok=True)
    run(DOCKER + ['info','--format','{{.Driver}}'])
    if args.action == 'reset':
        run(COMPOSE + ['down','-v','--remove-orphans']); return
    if args.action == 'stop':
        run(COMPOSE + ['down','--remove-orphans']); return
    if args.action == 'status':
        run(COMPOSE + ['ps']); return
    prepare(args)
    if args.action == 'prepare':
        return
    run(COMPOSE + ['up','-d','--wait','--wait-timeout','180','--no-build','--pull','never','ai'])
    if args.action == 'test':
        run([sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests/e2e', '-p', 'test_*.py'])
        run(COMPOSE + ['exec','-T','ai','sh','-c',
            'node --test tests/*.test.js && npx --no-install eslint tests/e2e/*.js tests/learning*.test.js services/learning*.js routes/learning.js routes/manualLearning.js public/js/learning.js'])
        run(COMPOSE + ['exec','-T','ai','node','--test','tests/e2e/paperless.test.js'])
        run([sys.executable, '-B', 'tests/e2e/restart-check.py', '--cloud'])
    free = shutil.disk_usage(ROOT).free / 1024**3
    print(f'Cloud stack ready; {free:.2f} GiB free on checkout filesystem.')


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(f'Test preparation failed (exit {error.returncode}); inspect the command output. No broad cleanup was performed.')
