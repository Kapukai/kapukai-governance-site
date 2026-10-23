"""Render precise, code-native Kapukai sharing cards. No source artwork is modified."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'community/public/share-cards/v2'
OUT.mkdir(parents=True,exist_ok=True)
IVORY='#F7F6F1';NAVY='#132B3D';GOLD='#A78238';MUTED='#566772'
SERIF='/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
SANS='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
SPECS=[
 ('https://kapukai.org/standards/authority-circuit/','authority-circuit','Authority Circuit\nArchitecture','Evidence before action. Correction by design.','RESEARCH FRAMEWORK',['Source','Evaluate','Prove','Remedy']),
 ('https://kapukai.org/observable/','observable-standard','Observable\nStandard','Make consequential decisions open to review.','RESEARCH FRAMEWORK',['Observe','Review','Correct']),
 ('https://kapukai.org/standards/','standards-directory','Standards\nDirectory','Explore the requirements behind the work.','RESEARCH LIBRARY',['Standards','Frameworks','Applications']),
 ('https://kapukai.org/first-circle/','first-circle','The First Circle','A small group. A shared place to learn.','PRIVATE ALPHA · INVITATION REQUIRED',None),
]
manifest=json.loads((ROOT/'community/sharing/manifest.json').read_text())
changed=[];assets=[]
for url,slug,title,subtitle,stage,steps in SPECS:
 im=Image.new('RGB',(1200,630),IVORY);d=ImageDraw.Draw(im)
 def text(pos,t,size=24,color=NAVY,serif=False,**kw):
  d.text(pos,t,font=ImageFont.truetype(SERIF if serif else SANS,size),fill=color,**kw)
 d.rectangle((52,46,144,138),outline=GOLD,width=3)
 text((98,89),'K',68,GOLD,True,anchor='mm')
 text((170,57),'KAPUKAI',30);text((172,99),'GOVERNANCE LAB',18,MUTED)
 for i,line in enumerate(title.splitlines()): text((52,192+i*78),line,66,serif=True)
 text((55,365 if '\n' in title else 290),subtitle,27,MUTED)
 if steps:
  y=466;left=68;right=1118
  d.line((left,y,right,y),fill='#DDD7C7',width=3)
  for i,s in enumerate(steps):
   x=int(left+(right-left)*i/(len(steps)-1))
   d.ellipse((x-7,y-7,x+7,y+7),fill=GOLD)
   anchor='la' if i==0 else 'ra' if i==len(steps)-1 else 'ma'
   text((x,486),s,22,anchor=anchor)
 else:
  # An open circle represents a small learning group, not a certification seal.
  d.arc((904,206,1096,398),25,335,fill=GOLD,width=3)
  for x,y in [(1000,206),(904,302),(1000,398)]:d.ellipse((x-8,y-8,x+8,y+8),fill=GOLD)
  text((55,434),'Meet. Learn. Build.',28)
 d.line((54,548,1146,548),fill=GOLD,width=2)
 text((55,575),stage,18,MUTED);text((1145,572),'kapukai.org',22,anchor='ra')
 path=OUT/(slug+'.jpg');im.save(path,quality=92,optimize=True)
 entry=next(e for e in manifest['pages'] if e['url']==url)
 old=entry['image'];entry.update(image='https://kapukai.org/share-cards/v2/'+path.name,image_alt='Kapukai gold K square. '+entry['title'],generated=True)
 changed.append({'url':url,'previous_image':old,'entry':entry})
 assets.append({'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
manifest['assets']+=assets
(ROOT/'community/sharing/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(ROOT/'community/sharing/brand-refresh.json').write_text(json.dumps({'changes':changed,'assets':assets,'preserved':'Film poster, founder portrait, lab photography, and all already aligned v1 cards.'},indent=2)+'\n')
print('Rendered four 1200 × 630 cards; original assets preserved.')
