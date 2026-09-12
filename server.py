"""Local-only HTTP interface, using Python's standard library."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from engine import ROOT, Store, Agent, SCENARIOS, close_offer, event

def make_handler(store):
    agent=Agent(store)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def send(self,status,payload,ctype='application/json'):
            body=json.dumps(payload).encode() if ctype=='application/json' else payload
            self.send_response(status)
            self.send_header('Content-Type',ctype)
            self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.end_headers();self.wfile.write(body)
        def do_GET(self):
            path=urlparse(self.path).path
            try:
                if path=='/api/scenarios': return self.send(200,SCENARIOS)
                if path.startswith('/api/runs/'):
                    rid=path.split('/')[3]
                    return self.send(200,store.get(rid))
                files={'/':('index.html','text/html; charset=utf-8'),'/app.js':('app.js','text/javascript; charset=utf-8'),'/style.css':('style.css','text/css; charset=utf-8')}
                if path in files:
                    name,ctype=files[path];return self.send(200,(ROOT/'static'/name).read_bytes(),ctype)
                return self.send(404,{'error':'Not found'})
            except KeyError: self.send(404,{'error':'Run not found'})
        def do_POST(self):
            # Reject browser cross-origin writes; this server is deliberately local-only.
            origin=self.headers.get('Origin')
            if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'):
                return self.send(403,{'error':'Cross-origin write rejected'})
            try:
                size=int(self.headers.get('Content-Length','0'))
                if size>10000: return self.send(413,{'error':'Body too large'})
                data=json.loads(self.rfile.read(size) or b'{}')
                if not isinstance(data,dict): raise ValueError('JSON object required')
                path=urlparse(self.path).path
                if path=='/api/runs': return self.send(201,store.create(data.get('scenario','double_disruption'),data.get('goal')))
                parts=path.strip('/').split('/')
                if len(parts)==4 and parts[:2]==['api','runs']:
                    rid,action=parts[2:]
                    if action=='step': return self.send(200,agent.step(rid))
                    if action=='run': return self.send(200,agent.run(rid))
                    if action=='disrupt':
                        oid=data.get('offer_id')
                        def change(w):
                            result=close_offer(w,oid);w['replan_count']+=1
                            return event('disruption','operator.inject','Live route outage injected','A judge can change any route; the controller must inspect the updated state.',result)
                        return self.send(200,store.mutate(rid,change))
                return self.send(404,{'error':'Not found'})
            except KeyError: self.send(404,{'error':'Run not found'})
            except (ValueError,TypeError,json.JSONDecodeError) as exc: self.send(400,{'error':str(exc)})
    return Handler

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);parser.add_argument('--db',default=None)
    args=parser.parse_args();server=ThreadingHTTPServer(('127.0.0.1',args.port),make_handler(Store(args.db)))
    print(f'RouteGuard ready: http://127.0.0.1:{args.port}',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: server.server_close()

