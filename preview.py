"""Serve only Stitch's generated preview and downloads on the local computer."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit

EXPORTS=Path(__file__).resolve().parent/'exports'

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass

    def do_GET(self):
        if self.headers.get('Host') not in ('localhost:8766','127.0.0.1:8766'):
            self.send_error(403);return
        path=urlsplit(self.path).path
        name='preview.html' if path=='/' else path.removeprefix('/')
        allowed={p.name for p in EXPORTS.iterdir() if p.is_file() and not p.is_symlink() and p.suffix in ('.gpx','.html','.json')}
        if name not in allowed:
            self.send_error(404);return
        data=(EXPORTS/name).read_bytes()
        mime={'.html':'text/html; charset=utf-8','.gpx':'application/gpx+xml','.json':'application/json'}[Path(name).suffix]
        self.send_response(200)
        self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'")
        if name.endswith('.gpx'):
            self.send_header('Content-Disposition',f'attachment; filename="{name}"')
        self.end_headers();self.wfile.write(data)

if __name__=='__main__':
    print('Stitch preview available at http://localhost:8766',flush=True)
    HTTPServer(('127.0.0.1',8766),Handler).serve_forever()
