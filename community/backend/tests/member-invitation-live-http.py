"""Read-only live checks. All invitation actions use absent/invalid Auth.

No invitation is created, no delivery is claimed, and no email is sent.
"""
import concurrent.futures
import datetime
import json
import urllib.error
import urllib.request

ENDPOINT = 'https://tbxfsjipkrdwyctepesf.supabase.co/functions/v1/kapukai-member-access'
ORIGIN = 'https://kapukai-community.vercel.app'
TOKEN = 'a' * 64  # Synthetic token, never a live invitation.
PAYLOAD = {'email': 'boundary-probe@example.invalid', 'invite_token': TOKEN}
CASES = [
    ('request_service_ready', 200, 'access_status', {}, {}),
    ('send_requires_auth', 401, 'operator_invitation_send', {**PAYLOAD, 'delivery_id': '11111111-1111-4111-8111-111111111111'}, {}),
    ('status_requires_auth', 401, 'operator_invitation_status', PAYLOAD, {}),
    ('forged_auth_rejected', 401, 'operator_invitation_status', PAYLOAD, {'authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.invalid'}),
    ('private_queue_requires_auth', 401, 'operator_access_queue', {}, {}),
    ('malformed_send_rejected', 400, 'operator_invitation_send', {}, {}),
    ('unapproved_origin_denied', 403, 'operator_invitation_status', PAYLOAD, {'origin': 'https://unapproved.example.invalid'}),
    ('get_does_not_change_state', 405, None, None, {'method': 'GET'}),
    ('query_tokens_rejected', 400, 'access_status', {}, {'query': '?token=not-a-secret'}),
]


def check(case):
    name, expected, action, payload, options = case
    headers = {'Origin': options.get('origin', ORIGIN), 'Content-Type': 'application/json'}
    if options.get('authorization'):
        headers['Authorization'] = options['authorization']
    body = json.dumps({'action': action, 'payload': payload}).encode() if action else None
    request = urllib.request.Request(ENDPOINT + options.get('query', ''), data=body, headers=headers, method=options.get('method', 'POST'))
    try:
        response = urllib.request.urlopen(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        data = json.loads(response.read())
        cache = response.headers.get('Cache-Control')
        cors = response.headers.get('Access-Control-Allow-Origin')
        passed = response.status == expected and cache == 'no-store' and cors == (None if 'origin' in options else ORIGIN)
        if name == 'request_service_ready':
            passed = passed and data.get('ok') is True and data.get('enabled') is True
        return {'name': name, 'status': response.status, 'expected_status': expected, 'cache_control': cache, 'cors': cors, 'passed': passed}


if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(check, CASES))
    print(json.dumps({'checked_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'endpoint': ENDPOINT, 'checks': results}, indent=2))
    assert all(result['passed'] for result in results), 'A live invitation boundary check failed'
