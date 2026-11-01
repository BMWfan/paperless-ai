#!/usr/bin/env python3
"""Import one disposable test image as a single layer for Docker's vfs driver.

Requires crane for remote images. Never pushes images or changes the daemon.
The caller must use test-only image names; Compose supplies runtime healthchecks.
"""
import argparse
import json
import subprocess
import tarfile
import copy


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('target')
    parser.add_argument('--remote', action='store_true')
    parser.add_argument('--crane', default='crane')
    parser.add_argument('--usr-volume', help='store /usr once in a new disposable test volume')
    parser.add_argument('--extractor-image', default='paperless-ai-e2e-cloud-redis:local',
                        help='small prepared test image providing tar (used only for /usr extraction)')
    args = parser.parse_args()
    if not args.target.startswith('paperless-ai-e2e-cloud-'):
        parser.error('target must be a disposable paperless-ai-e2e-cloud-* image')
    if args.usr_volume and (not args.remote or not args.usr_volume.startswith('paperless-ai-e2e_')):
        parser.error('--usr-volume requires a remote image and a paperless-ai-e2e_* volume')
    docker = ['docker', '--host=unix:///var/run/docker.sock']
    container = None
    if args.remote:
        # Resolve the tag once, so config and filesystem come from the same image.
        digest = subprocess.check_output(
            [args.crane, 'digest', '--platform', 'linux/amd64', args.source], text=True).strip()
        source = args.source.split('@')[0] + '@' + digest
        config = json.loads(subprocess.check_output(
            [args.crane, 'config', '--platform', 'linux/amd64', source]))['config']
        export = [args.crane, 'export', '--platform', 'linux/amd64', source, '-']
    else:
        image = json.loads(subprocess.check_output(docker + ['image', 'inspect', args.source]))[0]
        config = image['Config']
        source = image['Id']
        container = subprocess.check_output(
            docker + ['create', '--network', 'none', source], text=True).strip()
        export = docker + ['export', container]
    changes = []
    changes += ['--change', 'LABEL org.paperless-ai.e2e.source=' + json.dumps(source)]
    if args.usr_volume:
        changes += ['--change', 'LABEL org.paperless-ai.e2e.program-volume=' + json.dumps(args.usr_volume)]
    for field, instruction in [('Entrypoint', 'ENTRYPOINT'), ('Cmd', 'CMD'),
                               ('WorkingDir', 'WORKDIR'), ('User', 'USER'),
                               ('StopSignal', 'STOPSIGNAL')]:
        value = config.get(field)
        if value:
            changes += ['--change', instruction + ' ' +
                        (json.dumps(value) if isinstance(value, list) else value)]
    for env in config.get('Env', []):
        key, value = env.split('=', 1)
        changes += ['--change', 'ENV ' + key + '=' + json.dumps(value)]
    for port in config.get('ExposedPorts', {}) or {}:
        changes += ['--change', 'EXPOSE ' + port]
    if config.get('Volumes'):
        changes += ['--change', 'VOLUME ' + json.dumps(list(config['Volumes']))]
    try:
        producer = subprocess.Popen(export, stdout=subprocess.PIPE)
        if args.usr_volume:
            # Refuse to overwrite an existing runtime volume.
            exists = subprocess.run(docker + ['volume', 'inspect', args.usr_volume],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if exists.returncode == 0:
                producer.terminate()
                producer.wait()
                raise SystemExit('Runtime volume exists; stop this test stack and explicitly remove its runtime volume before preparing it again')
            subprocess.run(docker + ['volume', 'create', args.usr_volume], check=True)
            extraction = subprocess.Popen(docker + [
                'run', '--rm', '-i', '--network', 'none',
                '--mount', 'type=volume,src=' + args.usr_volume + ',dst=/runtime',
                args.extractor_image, 'tar', '-xpf', '-', '-C', '/runtime'],
                stdin=subprocess.PIPE)
            importing = subprocess.Popen(docker + ['import'] + changes + ['-', args.target],
                                         stdin=subprocess.PIPE)
            failure = None
            try:
                with tarfile.open(fileobj=producer.stdout, mode='r|') as archive:
                    with tarfile.open(fileobj=importing.stdin, mode='w|') as root_tar:
                        with tarfile.open(fileobj=extraction.stdin, mode='w|') as usr_tar:
                            for entry in archive:
                                name = entry.name.removeprefix('./')
                                data = archive.extractfile(entry) if entry.isfile() else None
                                if name.startswith('usr/'):
                                    entry = copy.copy(entry)
                                    entry.name = name[4:]
                                    if entry.islnk():
                                        entry.linkname = entry.linkname.removeprefix('./').removeprefix('usr/')
                                    if entry.name:
                                        usr_tar.addfile(entry, data)
                                else:
                                    root_tar.addfile(entry, data)
            except BaseException as error:
                failure = error
            finally:
                importing.stdin.close()
                extraction.stdin.close()
                producer.stdout.close()
            codes = [producer.wait(), extraction.wait(), importing.wait()]
            if failure or any(codes):
                subprocess.run(docker + ['image', 'rm', args.target], check=False)
                subprocess.run(docker + ['volume', 'rm', args.usr_volume], check=False)
                if failure:
                    raise failure
                raise SystemExit('Split image preparation failed')
            print('Created compact test image and /usr volume:', args.target, args.usr_volume, 'from', source)
            return
        try:
            result = subprocess.run(docker + ['import'] + changes + ['-', args.target],
                                    stdin=producer.stdout, check=False)
        finally:
            producer.stdout.close()
        export_code = producer.wait()
        if result.returncode or export_code:
            subprocess.run(docker + ['image', 'rm', args.target], check=False)
            raise SystemExit('Image export/import failed')
        print('Created compact test image:', args.target, 'from', source)
    finally:
        if container:
            subprocess.run(docker + ['rm', container], check=True)


if __name__ == '__main__':
    main()
