"""Local OAuth setup for Stitch. No activity mutation endpoints are implemented."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import html
import json
import os
import secrets
import time

ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT / '.local'
CLIENT_ID = '262735'
BASE = 'http://localhost:8765'
CALLBACK = BASE + '/callback'
SCOPES = 'read,activity:read_all'
SESSION = secrets.token_urlsafe(32)
CSRF = secrets.token_urlsafe(32)
PENDING = {}
STATUS = {'connected': False}
STYLE = '''*{box-sizing:border-box}body{margin:0;background:#f4f5f2;color:#18352d;font:17px/1.55 -apple-system,BlinkMacSystemFont,sans-serif}main{max-width:720px;margin:7vh auto;padding:32px}header{font-size:20px;font-weight:750;margin-bottom:64px}h1{font-size:clamp(34px,7vw,52px);line-height:1.08;letter-spacing:-1.7px;margin:0 0 24px}p{color:#4e625a}label{display:block;font-weight:650;margin:32px 0 8px}input{width:100%;padding:14px;font:inherit;border:1px solid #9dac9f;border-radius:7px;background:white}button,.button{display:inline-block;background:#fc4c02;color:white;font:600 16px -apple-system,sans-serif;padding:16px 24px;border:0;border-radius:7px;text-decoration:none;cursor:pointer;margin:24px 0}button:hover,.button:hover{background:#dd4100}.note{padding-top:24px;border-top:1px solid #d6ded6;font-size:14px}a{color:#235c43}.error{color:#a32323}code{font-size:14px}'''

def private_json(path, data):
    PRIVATE.mkdir(mode=0o700, exist_ok=True)
    os.chmod(PRIVATE, 0o700)
    temp = path.with_suffix('.tmp')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as file:
        json.dump(data, file)
    os.replace(temp, path)
    os.chmod(path, 0o600)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # OAuth codes, cookies, and tokens must never enter access logs.

    def valid_host(self):
        return self.headers.get('Host') in ('localhost:8765', '127.0.0.1:8765')

    def session_ok(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            value = cookie.get('stitch_session')
            return value is not None and secrets.compare_digest(value.value, SESSION)
        except Exception:
            return False

    def page(self, title, body, status=200, cookie=False):
        markup = f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)} · Stitch</title><style>{STYLE}</style><main><header>Stitch</header>{body}</main></html>'
        data = markup.encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'same-origin' if self.path == '/' else 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://www.strava.com; frame-ancestors 'none'; base-uri 'none'")
        if cookie:
            self.send_header('Set-Cookie', f'stitch_session={SESSION}; HttpOnly; SameSite=Lax; Path=/')
        self.end_headers()
        self.wfile.write(data)

    def redirect(self, url):
        self.send_response(303)
        self.send_header('Location', url)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if not self.valid_host():
            return self.page('Invalid host', '<h1>Invalid host</h1>', 403)
        parsed = urlsplit(self.path)
        if parsed.path == '/':
            if STATUS['connected']:
                return self.redirect('/connected')
            body = f'''<h1>Bring the two rides together.</h1><p>Connect your Strava account to read the two recordings from 6 September. We’ll create a local preview and a downloadable GPX file.</p><form method="post" action="/connect"><input type="hidden" name="csrf" value="{CSRF}"><label for="secret">Application client secret</label><input id="secret" name="client_secret" type="password" required autocomplete="off" spellcheck="false"><button type="submit">Connect with Strava</button></form><p class="note">This preview requests read access, including private activities and their full GPS recordings. The secret and connection tokens stay in a private folder on this Mac and are used only with Strava. There is no upload, edit, or delete function. You can revoke access in Strava → Settings → My Apps, and delete local data from this project’s .local and exports folders.</p>'''
            return self.page('Connect', body, cookie=True)
        if parsed.path == '/callback':
            query = parse_qs(parsed.query)
            state = query.get('state', [''])[0]
            if not self.session_ok() or not PENDING or not secrets.compare_digest(state, PENDING.get('state', '')) or time.time() > PENDING.get('expires', 0):
                return self.page('Connection expired', '<h1>Connection expired.</h1><p>Please return to the setup page and try again.</p><a href="/">Start again</a>', 400)
            secret = PENDING['secret']
            PENDING.clear()
            if query.get('error'):
                return self.page('Connection cancelled', '<h1>Connection cancelled.</h1><p>No activity data has been read.</p><a href="/">Try again</a>', 400)
            granted = set(query.get('scope', [''])[0].replace(',', ' ').split())
            code = query.get('code', [''])[0]
            if 'activity:read_all' not in granted or not code:
                return self.page('Permission needed', '<h1>Private-activity access is needed.</h1><p>Both selected rides are private. Please enable access to your private activities when reconnecting.</p><a href="/">Try again</a>', 400)
            request = Request('https://www.strava.com/oauth/token', data=urlencode({'client_id': CLIENT_ID, 'client_secret': secret, 'code': code, 'grant_type': 'authorization_code'}).encode(), method='POST')
            try:
                with urlopen(request, timeout=25) as response:
                    token = json.load(response)
                reported = set(token.get('scope', ' '.join(granted)).replace(',', ' ').split())
                if 'activity:read_all' not in reported or not token.get('access_token') or not token.get('refresh_token'):
                    raise ValueError('Invalid token response')
                token['scope'] = ' '.join(sorted(reported))
                private_json(PRIVATE / 'tokens.json', token)
                private_json(PRIVATE / 'client.json', {'client_id': CLIENT_ID, 'client_secret': secret})
                STATUS.update(connected=True, scopes=sorted(reported))
            except (HTTPError, URLError, ValueError, OSError):
                return self.page('Connection failed', '<h1>Couldn’t finish connecting.</h1><p>Please check the client secret and try again. No activity data has been changed.</p><a href="/">Try again</a>', 502)
            return self.redirect('/connected')
        if parsed.path == '/connected':
            if not self.session_ok() or not STATUS['connected']:
                return self.redirect('/')
            return self.page('Connected', '<h1>Connected. Ready to stitch.</h1><p>Stitch can now read your private activities. The two selected recordings can be downloaded for the local preview.</p><p class="note">Read access only. Your Strava activities have not been changed.</p>')
        if parsed.path == '/status':
            if not self.session_ok():
                return self.page('Forbidden', '<h1>Forbidden</h1>', 403)
            return self.page('Status', '<pre>' + html.escape(json.dumps(STATUS)) + '</pre>')
        return self.page('Not found', '<h1>Page not found.</h1>', 404)

    def do_POST(self):
        if not self.valid_host() or not self.session_ok() or self.headers.get('Origin') != BASE:
            return self.page('Forbidden', '<h1>Request rejected.</h1>', 403)
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if not 0 < length < 4096 or urlsplit(self.path).path != '/connect':
            return self.page('Invalid request', '<h1>Invalid request.</h1>', 400)
        values = parse_qs(self.rfile.read(length).decode())
        if not secrets.compare_digest(values.get('csrf', [''])[0], CSRF):
            return self.page('Forbidden', '<h1>Request rejected.</h1>', 403)
        secret = values.get('client_secret', [''])[0].strip()
        if len(secret) < 20 or len(secret) > 256 or any(c.isspace() for c in secret):
            return self.page('Check client secret', '<h1>Check the client secret.</h1><a href="/">Back to setup</a>', 400)
        PENDING.clear()
        PENDING.update(state=secrets.token_urlsafe(32), secret=secret, expires=time.time() + 600)
        self.redirect('https://www.strava.com/oauth/authorize?' + urlencode({'client_id': CLIENT_ID, 'redirect_uri': CALLBACK, 'response_type': 'code', 'approval_prompt': 'force', 'scope': SCOPES, 'state': PENDING['state']}))

if __name__ == '__main__':
    print('Stitch connection helper listening on http://localhost:8765', flush=True)
    HTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
