import json
import subprocess
import urllib.parse
import urllib.request
import urllib.error
import hashlib
import uuid

env = {}
with open('/home/danie/pelada-homologacao/supabase-project/.env', encoding='utf-8') as stream:
    for line in stream:
        key, separator, value = line.strip().partition('=')
        if separator and key == 'SERVICE_ROLE_KEY':
            env[key] = value.strip('"\'')
key = env.get('SERVICE_ROLE_KEY')
if not key:
    raise SystemExit('Chave local indisponivel; nenhuma credencial exibida.')
query = "SELECT coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name,'size',metadata->>'size')),'[]'::json)::text FROM storage.objects"
result = subprocess.run(['docker', 'exec', 'supabase-db', 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-c', query], check=True, capture_output=True, text=True)
objects = json.loads(result.stdout)
ok = failed = 0
total = 0
errors = {}
contents = []
for obj in objects:
    path = urllib.parse.quote(obj['bucket'], safe='') + '/' + urllib.parse.quote(obj['name'], safe='/')
    request = urllib.request.Request('http://127.0.0.1:8000/storage/v1/object/authenticated/' + path, headers={'apikey': key, 'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            content = response.read()
        if not obj['size'] or len(content) != int(obj['size']):
            failed += 1
        else:
            ok += 1
            total += len(content)
            contents.append(content)
    except urllib.error.HTTPError as error:
        errors[str(error.code)] = errors.get(str(error.code), 0) + 1
        failed += 1
    except (urllib.error.URLError, ValueError, OSError):
        errors['connection_or_format'] = errors.get('connection_or_format', 0) + 1
        failed += 1
print(f'objects={len(objects)} downloaded_matching_size={ok} bytes={total} failures={failed} errors={errors}')
if failed:
    raise SystemExit(1)

bucket = 'liga-rehearsal-' + uuid.uuid4().hex
headers = {'apikey': key, 'Authorization': 'Bearer ' + key}
base = 'http://127.0.0.1:8000/storage/v1'
created = False
uploaded = []
verified = 0
try:
    payload = json.dumps({'id': bucket, 'name': bucket, 'public': False}).encode()
    request = urllib.request.Request(base + '/bucket', data=payload, method='POST', headers={**headers, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=15) as response:
        response.read()
    created = True
    for index, content in enumerate(contents):
        name = str(index) + '.bin'
        request = urllib.request.Request(base + '/object/' + bucket + '/' + name, data=content, method='POST', headers={**headers, 'Content-Type': 'application/octet-stream'})
        with urllib.request.urlopen(request, timeout=15) as response:
            response.read()
        uploaded.append(name)
        request = urllib.request.Request(base + '/object/authenticated/' + bucket + '/' + name, headers=headers)
        with urllib.request.urlopen(request, timeout=15) as response:
            copied = response.read()
        if hashlib.sha256(content).digest() != hashlib.sha256(copied).digest():
            raise RuntimeError('Conteudo divergente no Storage local.')
        verified += 1
    print(f'fixture_copied_and_sha256_verified={verified}')
finally:
    if created:
        if uploaded:
            payload = json.dumps({'prefixes': uploaded}).encode()
            request = urllib.request.Request(base + '/object/' + bucket, data=payload, method='DELETE', headers={**headers, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=15) as response:
                response.read()
        request = urllib.request.Request(base + '/bucket/' + bucket, method='DELETE', headers=headers)
        with urllib.request.urlopen(request, timeout=15) as response:
            response.read()
        print('fixture_storage_cleanup=ok')
