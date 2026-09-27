import json, urllib.request, urllib.error, time
from pathlib import Path
config=json.loads((Path(__file__).parents[1]/'public/config.js').read_text().split('=',1)[1].strip().rstrip(';'))
def call(body,origin='https://kapukai.org',auth=True):
 headers={'Content-Type':'application/json','Origin':origin}
 if auth: headers.update({'Authorization':'Bearer '+config['anonKey'],'apikey':config['anonKey']})
 req=urllib.request.Request(config['endpoint'],data=json.dumps(body).encode(),headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=35) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
body={'action':'submit','email':'assurance-test-20260927@example.invalid','display_name':'Synthetic QA','message':'Synthetic integration test. No real inquiry.','topics':['assurance','books'],'adult':True,'consent':True,'started_at':int(time.time()*1000)-5000,'website':''}
checks=[('missing authorization',body,'https://kapukai.org',False,401),('origin rejected',body,'https://invalid.example',True,403),('consent required',{**body,'consent':False},'https://kapukai.org',True,400),('topics rejected',{**body,'topics':['invalid']},'https://kapukai.org',True,400),('invalid token',{'action':'confirm','token':'x'},'https://kapukai.org',True,400),('valid synthetic request',body,'https://kapukai.org',True,200)]
for name,b,o,a,expected in checks:
 status,result=call(b,o,a); assert status==expected,(name,status,result);print(name,'PASS',status)
 if name=='valid synthetic request': assert result['delivery']=='test_skipped',result
