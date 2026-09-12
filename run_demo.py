import argparse
import json
from pathlib import Path
from engine import Store, Agent, SCENARIOS

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--scenario',choices=SCENARIOS,default='double_disruption');p.add_argument('--output');p.add_argument('--db')
    a=p.parse_args();s=Store(a.db);r=Agent(s).run(s.create(a.scenario)['id'])
    for e in r['events']: print(f"{e['seq']:02} {e['kind'].upper():13} {e['tool']:32} {e['title']}")
    print(json.dumps({'status':r['world']['status'],'verification':r['world']['verification']},indent=2))
    if a.output:
        Path(a.output).parent.mkdir(parents=True,exist_ok=True);Path(a.output).write_text(json.dumps(r,indent=2),encoding='utf-8')

