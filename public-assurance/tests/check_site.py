from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import json
root=Path(__file__).parents[1]/'public'
class Check(HTMLParser):
 def __init__(self):super().__init__();self.ids=set();self.links=[];self.checks=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.add(a['id'])
  if tag in ('a','link','script'):
   url=a.get('href',a.get('src',''));self.links.append(url)
  if tag=='input' and a.get('type')=='checkbox':self.checks.append(a)
p=Check();p.feed((root/'index.html').read_text())
for url in p.links:
 u=urlsplit(url)
 if u.scheme or u.netloc:continue
 if u.path:assert (root/u.path).is_file(),url
 if u.fragment:assert u.fragment in p.ids,url
assert all('checked' not in c for c in p.checks)
assert len([c for c in p.checks if c.get('name')=='topics'])==9
assert len(list((root/'documents').glob('*')))==10
json.loads((root.parent/'vercel.json').read_text())
print('PASS: local links, anchors, 10 document downloads, 9 unchecked topics, valid deployment configuration')
