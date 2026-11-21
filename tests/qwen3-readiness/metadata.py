"""Phase zero: pinned metadata only; deliberately has no generation client."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
PROTOCOL = json.loads((ROOT / 'protocol.json').read_text())
MODEL = PROTOCOL['candidate']
CONTAINER = 'qwen3-readiness-metadata'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify(directory):
    """Verify original manifest against runtime metadata, never infer quality."""
    manifest_bytes = (directory / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    tags = json.loads((directory / 'tags.json').read_text())['models']
    show = json.loads((directory / 'show.json').read_text())
    version = json.loads((directory / 'version.json').read_text())['version']
    assert version == PROTOCOL['ollamaVersion'], 'runtime version mismatch'
    matches = [row for row in tags if row.get('name') == MODEL]
    assert len(matches) == 1, 'exact model tag absent or ambiguous'
    assert matches[0]['digest'].removeprefix('sha256:') == digest(manifest_bytes), 'manifest digest mismatch'
    for details in (show['details'], matches[0]['details']):
        assert details['family'] == 'qwen3', 'family mismatch'
        assert re.fullmatch(r'4(?:\.0+)?B', details['parameter_size']), 'size class mismatch'
        assert details['quantization_level'] == 'Q4_K_M', 'quantization mismatch'
    for key in ('template', 'license', 'model_info'):
        assert show.get(key), 'missing ' + key
    # The registry tag/manifest binds identity; architecture metadata alone cannot
    # establish the instruction-tuning provenance or accuracy of its weights.
    assert manifest.get('layers'), 'missing layers'
    for layer in [manifest['config'], *manifest['layers']]:
        assert re.fullmatch(r'sha256:[a-f0-9]{64}', layer['digest']), 'invalid layer digest'
        assert isinstance(layer['size'], int) and layer['size'] > 0, 'invalid layer size'
    return {'manifestDigest': digest(manifest_bytes), 'layers': manifest['layers'],
            'identityEvidence': 'exact registry tag and original manifest; not independent weight provenance',
            'runtimeVersion': version, 'inferenceCompatibility': 'UNMEASURED',
            'memoryQualification': 'UNMEASURED', 'accuracy': 'UNMEASURED'}


def run(directory):
    directory.mkdir(parents=True, exist_ok=False)
    report = {'model': MODEL, 'commit': os.environ.get('GITHUB_SHA'),
              'run': os.environ.get('GITHUB_RUN_ID'), 'attempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
              'generationRequests': 0, 'passed': False, 'pullAttempts': []}
    def command(args, name, timeout=30):
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
        (directory / name).write_bytes(result.stdout)
        return result.returncode
    try:
        assert report['attempt'] == '1', 'measurement reruns prohibited'
        frozen = json.loads((ROOT / 'manifest.json').read_text())
        for name, expected in frozen['files'].items():
            assert digest((ROOT / name).read_bytes()) == expected, 'frozen input changed: ' + name
        assert command(['docker', 'run', '-d', '--name', CONTAINER, '--memory=8g', '--cpus=4',
                        '-p', '127.0.0.1:11434:11434', '-e', 'OLLAMA_NO_CLOUD=1',
                        '-e', 'OLLAMA_NUM_PARALLEL=1', 'ollama/ollama:' + PROTOCOL['ollamaVersion']], 'start.log', 180) == 0
        for _ in range(60):
            if command(['docker', 'exec', CONTAINER, 'ollama', 'list'], 'ready.log') == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Ollama not ready')
        for attempt in range(1, 4):
            code = command(['docker', 'exec', CONTAINER, 'ollama', 'pull', MODEL], f'pull-{attempt}.log', 300)
            report['pullAttempts'].append({'attempt': attempt, 'exitCode': code})
            if code == 0:
                break
        else:
            raise RuntimeError('exact candidate unavailable: all three pulls failed; STOP, no substitution')
        manifest_path = '/root/.ollama/models/manifests/registry.ollama.ai/library/' + MODEL.replace(':', '/')
        assert command(['docker', 'cp', CONTAINER + ':' + manifest_path, str(directory / 'manifest.json')], 'copy.log') == 0
        for endpoint in ('version', 'tags', 'show'):
            args = ['curl', '--fail-with-body', '--silent', '--show-error', '--max-time', '20',
                    'http://127.0.0.1:11434/api/' + endpoint]
            if endpoint == 'show':
                args += ['-H', 'Content-Type: application/json', '-d', json.dumps({'model': MODEL})]
            assert command(args, endpoint + '.json') == 0, endpoint + ' metadata request failed'
        report['metadata'] = verify(directory)
        report['passed'] = True
    except Exception as error:
        report['error'] = str(error)
    finally:
        report['files'] = {p.name: digest(p.read_bytes()) for p in sorted(directory.iterdir()) if p.is_file()}
        (directory / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(run(Path(sys.argv[1]).resolve()))
