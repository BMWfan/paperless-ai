"""Offline trigger/privilege contracts; no GitHub or registry writes."""
import pathlib
import unittest
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
# BaseLoader deliberately preserves the YAML key `on` instead of YAML 1.1 booleans.
def workflow(name):
    return yaml.load((ROOT / '.github/workflows' / name).read_text(), Loader=yaml.BaseLoader)

class WorkflowPolicy(unittest.TestCase):
    def test_automatic_build_cannot_publish(self):
        doc = workflow('docker-build-push.yml')
        self.assertEqual(set(doc['on']), {'pull_request', 'push'})
        self.assertEqual(doc['permissions'], {'contents': 'read'})
        steps = doc['jobs']['build']['steps']
        self.assertFalse(any('login-action' in s.get('uses', '') for s in steps))
        builds = [s for s in steps if 'build-push-action' in s.get('uses', '')]
        self.assertEqual(len(builds), 1)
        self.assertEqual(builds[0]['with']['push'], 'false')

    def test_only_manual_path_has_write_access_and_environment(self):
        doc = workflow('manualPush.yml')
        self.assertEqual(set(doc['on']), {'workflow_dispatch'})
        self.assertEqual(doc['on']['workflow_dispatch']['inputs']['latest']['default'], 'false')
        self.assertNotIn('default', doc['on']['workflow_dispatch']['inputs']['tag'])
        self.assertEqual(doc['jobs']['preflight']['permissions'], {'contents': 'read', 'actions': 'read'})
        job = doc['jobs']['publish']
        self.assertEqual(job['needs'], 'preflight')
        self.assertEqual(job['environment'], 'ghcr-release')
        self.assertEqual(job['permissions']['packages'], 'write')
        steps = job['steps']
        gate = next(i for i,s in enumerate(steps) if 'registry-tags' in s.get('with', {}).get('script', ''))
        login = next(i for i,s in enumerate(steps) if 'login-action' in s.get('uses', ''))
        build = next(i for i,s in enumerate(steps) if 'build-push-action' in s.get('uses', ''))
        self.assertLess(gate, login)
        self.assertLess(login, build)
        self.assertEqual(steps[login]['with']['registry'], 'ghcr.io')
        self.assertEqual(steps[build]['with']['push'], 'true')
        self.assertTrue(any(s.get('with', {}).get('ref') == '${{ needs.preflight.outputs.sha }}' for s in steps[gate+1:login]))

    def test_discord_removed_and_main_is_actually_tested(self):
        self.assertFalse((ROOT / '.github/workflows/release-to-discord.yml').exists())
        self.assertIn('main', workflow('learning-e2e.yml')['on']['push']['branches'])
        for path in (ROOT / '.github/workflows').glob('*.yml'):
            text = path.read_text()
            self.assertNotIn('DISCORD_WEBHOOK', text)
            self.assertNotIn('DOCKER_PASSWORD', text)
            if path.name != 'manualPush.yml':
                self.assertNotIn('push: true', text)
                self.assertNotIn('packages: write', text)

if __name__ == '__main__':
    unittest.main()
