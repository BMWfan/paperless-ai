#!/usr/bin/env python3
"""Change one synthetic document while the isolated app is stopped, then verify detection."""
import argparse
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
MUTATE = '''
import json,sys,urllib.request
base='http://127.0.0.1:8000/api'
request=urllib.request.Request(base+'/token/',data=json.dumps({'username':'test','password':'isolated-test-only'}).encode(),headers={'Content-Type':'application/json'})
with urllib.request.urlopen(request,timeout=20) as response: token=json.load(response)['token']
request=urllib.request.Request(base+'/documents/'+sys.argv[1]+'/',method='PATCH',data=json.dumps({'title':sys.argv[2]}).encode(),headers={'Content-Type':'application/json','Authorization':'Token '+token})
with urllib.request.urlopen(request,timeout=20) as response: assert response.status==200
'''


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--cloud',action='store_true');args=parser.parse_args()
    env=os.environ.copy()
    for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','COMPOSE_PROFILES']:
        env.pop(key,None)
    compose=['docker','--host=unix:///var/run/docker.sock','compose','--project-name','paperless-ai-e2e','-f','docker-compose.test.yml']
    if args.cloud: compose+=['-f','docker-compose.test-cloud.yml']
    def run(arguments,capture=False):
        return subprocess.run(compose+arguments,cwd=ROOT,env=env,text=True,check=True,stdout=subprocess.PIPE if capture else None)
    probe=json.loads(run(['exec','-T','ai','node','tests/e2e/restart-probe.js','prepare'],True).stdout)
    if not isinstance(probe['id'],int) or probe['id']<=0 or not probe['title'].startswith('Offline synthetic correction '):
        raise SystemExit('Invalid synthetic restart probe')
    run(['stop','ai'])
    try:
        run(['exec','-T','-e','NO_PROXY=localhost,127.0.0.1','-e','no_proxy=localhost,127.0.0.1','paperless','python3','-c',MUTATE,str(probe['id']),probe['title']])
    finally:
        run(['up','-d','--wait','--wait-timeout','180','--no-build','--pull','never','ai'])
    run(['exec','-T','ai','node','tests/e2e/restart-probe.js','verify'])


if __name__=='__main__':
    main()
