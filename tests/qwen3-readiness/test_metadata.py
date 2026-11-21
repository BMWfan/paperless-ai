import importlib.util
import json
import gzip
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess

spec = importlib.util.spec_from_file_location('metadata', Path(__file__).with_name('metadata.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class MetadataTest(unittest.TestCase):
    def fixture(self, directory):
        layer = {'digest': 'sha256:' + 'a' * 64, 'size': 100, 'mediaType': 'application/octet-stream'}
        manifest = json.dumps({'config': layer, 'layers': [layer]}).encode()
        (directory / 'manifest.json').write_bytes(manifest)
        details = {'family': 'qwen3', 'parameter_size': '4.0B', 'quantization_level': 'Q4_K_M'}
        tags = {'models': [{'name': m.MODEL, 'digest': m.digest(manifest), 'details': details}]}
        show = {'details': details, 'template': 'instruct-template', 'license': 'Apache 2.0', 'model_info': {'architecture': 'qwen3'}}
        for name, data in [('tags', tags), ('show', show), ('version', {'version': '0.12.6'})]:
            (directory / (name + '.json')).write_text(json.dumps(data))

    def test_metadata_only_and_mismatches(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            self.fixture(directory)
            result = m.verify(directory)
            self.assertEqual(result['accuracy'], 'UNMEASURED')
            self.assertEqual(result['inferenceCompatibility'], 'UNMEASURED')
            cases = [('version', ['version'], '0.13.0'), ('tags', ['models', 0, 'name'], 'qwen3:4b'),
                     ('tags', ['models', 0, 'digest'], 'b' * 64),
                     ('show', ['details', 'family'], 'qwen2'),
                     ('show', ['details', 'parameter_size'], '8.0B'),
                     ('show', ['details', 'quantization_level'], 'Q8_0'),
                     ('show', ['template'], ''), ('show', ['license'], '')]
            for name, keys, value in cases:
                with self.subTest(keys=keys, value=value):
                    self.fixture(directory)
                    file = directory / (name + '.json')
                    data = json.loads(file.read_text()); target = data
                    for key in keys[:-1]:
                        target = target[key]
                    target[keys[-1]] = value
                    file.write_text(json.dumps(data))
                    with self.assertRaises(AssertionError):
                        m.verify(directory)

    def test_unavailable_candidate_stops_without_generation(self):
        commands = []
        def fake_run(args, **kwargs):
            commands.append(args)
            return subprocess.CompletedProcess(args, 1 if 'pull' in args else 0,
                                               stdout=b'exact candidate unavailable')
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / 'result'
            with patch.object(m.subprocess, 'run', side_effect=fake_run), patch.dict(m.os.environ, {'GITHUB_RUN_ATTEMPT': '1'}):
                self.assertEqual(m.run(directory), 1)
            report = json.loads((directory / 'report.json').read_text())
            self.assertFalse(report['passed'])
            self.assertEqual(report['generationRequests'], 0)
            self.assertEqual(len(report['pullAttempts']), 3)
            self.assertFalse(any('curl' in command for command in commands))
            self.assertTrue(all(m.MODEL in command for command in commands if 'pull' in command))

    def test_archived_smoke_is_original_complete_and_blocks_confirmation(self):
        root = Path(__file__).parent
        marker = json.loads((root / 'smoke-artifact.json').read_text())
        stored = (root / marker['archive']).read_bytes()
        self.assertEqual(m.digest(stored), marker['storedSha256'])
        raw = gzip.decompress(stored)
        self.assertEqual(m.digest(raw), marker['payloadSha256'])
        report = json.loads(raw)
        self.assertEqual(report['commit'], marker['commit'])
        self.assertEqual(report['run'], marker['run'])
        self.assertEqual(report['attempt'], 1)
        self.assertNotIn('fixtureOnly', report)
        self.assertTrue(report['complete'])
        self.assertEqual(report['requestCount'], 20)
        self.assertEqual(len(report['rows']), 20)
        self.assertTrue(all(row['terminal'] for row in report['rows']))
        self.assertEqual(marker['phase2Requests'], 0)
        self.assertFalse(marker['gate']['passed'])
        self.assertFalse(report['gate']['passed'])
        self.assertEqual(report['gate'], json.loads((root / 'report.json').read_text()))
        for row in report['rows']:
            if 'response' in row:
                self.assertEqual(json.loads(row['responseRaw']), row['response'])

    def test_frozen_inputs(self):
        root = Path(__file__).parent
        manifest = json.loads((root / 'manifest.json').read_text())
        for name, expected in manifest['files'].items():
            self.assertEqual(m.digest((root / name).read_bytes()), expected, name)
        cases = json.loads((root / 'cases.json').read_text())['cases']
        self.assertEqual(len(cases), 40)
        self.assertEqual(len({case['id'] for case in cases}), 40)
        confirmation = [case for case in cases if case['split'] == 'confirmation']
        self.assertEqual(len(confirmation), 30)
        self.assertEqual(sum(case['language'] == 'en' for case in confirmation), 15)
        selection = json.loads((root / 'smoke-selection.json').read_text())
        self.assertEqual(len(selection['caseIds']), 20)


if __name__ == '__main__':
    unittest.main()
