"""Safety contracts for the reusable cloud setup; no real Docker data is touched."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('cloud_setup', Path(__file__).with_name('cloud-test.py'))
SETUP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SETUP)


class CloudSetupTests(unittest.TestCase):
    def test_download_checks_checksum_before_installing_executable(self):
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode='w:gz') as bundle:
            entry = tarfile.TarInfo('crane'); entry.size = 7
            bundle.addfile(entry, io.BytesIO(b'fixture'))
        payload = archive.getvalue()
        expected = hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(SETUP, 'CACHE', Path(directory), create=True), patch.object(SETUP.platform, 'machine', return_value='x86_64'):
                def response(url, **_):
                    return io.BytesIO((expected + '  go-containerregistry_Linux_x86_64.tar.gz\n').encode() if url.endswith('checksums.txt') else payload)
                with patch.object(SETUP.urllib.request, 'urlopen', side_effect=response):
                    executable = Path(SETUP.crane_path(SimpleNamespace(crane=None)))
                    self.assertEqual(executable.read_bytes(), b'fixture')
                    self.assertEqual(executable.stat().st_mode & 0o777, 0o700)
                executable.unlink()
                with patch.object(SETUP.urllib.request, 'urlopen', side_effect=[io.BytesIO(b'wrong  go-containerregistry_Linux_x86_64.tar.gz\n'), io.BytesIO(payload)]):
                    with self.assertRaisesRegex(SystemExit, 'checksum verification failed'):
                        SETUP.crane_path(SimpleNamespace(crane=None))
                self.assertFalse(executable.exists())

    def test_preparation_never_removes_an_unpaired_existing_program_volume(self):
        commands = []
        def run(command, **_):
            commands.append(command)
            return SimpleNamespace(returncode=0, stdout='feature/learning-engine-v2\n')
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            (cache / 'prepared.json').write_text(json.dumps({'fingerprint':'same', 'image':'app-id'}))
            def image(image):
                return None if image == SETUP.PAPERLESS_IMAGE else 'app-id'
            with patch.object(SETUP, 'CACHE', cache, create=True), patch.object(SETUP, 'run', side_effect=run), patch.object(SETUP, 'image_id', side_effect=image), patch.object(SETUP, 'fingerprint', return_value='same'):
                with self.assertRaisesRegex(SystemExit, 'program volume exists'):
                    SETUP.prepare(SimpleNamespace(crane=None))
        self.assertTrue(all('rm' not in command and 'prune' not in command for command in commands))
        self.assertEqual(commands, [
            ['git', 'branch', '--show-current'],
            SETUP.DOCKER + ['volume', 'inspect', SETUP.RUNTIME],
        ])

    def test_build_cache_cleanup_selects_only_ids_created_by_this_preparation(self):
        commands, state = [], {'compacted':False}
        def run(command, **_):
            commands.append(command)
            if 'tests/e2e/compact-image.py' in command:
                state['compacted'] = True
            return SimpleNamespace(returncode=0, stdout='feature/learning-engine-v2\n')
        def image(image):
            return ('new-app' if state['compacted'] else 'old-app') if image == SETUP.APP else 'service-id'
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(SETUP, 'CACHE', Path(directory), create=True), patch.object(SETUP, 'run', side_effect=run), patch.object(SETUP, 'image_id', side_effect=image), patch.object(SETUP, 'fingerprint', return_value='changed'), patch.object(SETUP, 'cache_ids', side_effect=[{'unrelated-cache'}, {'unrelated-cache','owned-new'}]), patch.object(SETUP.shutil, 'disk_usage', return_value=SimpleNamespace(free=10*1024**3)):
                SETUP.prepare(SimpleNamespace(crane=None))
        prunes = [command for command in commands if 'prune' in command]
        self.assertEqual(len(prunes),1)
        self.assertIn('id=^(owned\\-new)$',prunes[0])
        self.assertNotIn('unrelated-cache',' '.join(prunes[0]))


if __name__ == '__main__':
    unittest.main()
