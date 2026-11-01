from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from html import escape
import textwrap,json,hashlib
ROOT=Path(__file__).parent
OUT=ROOT/'public/evidence/carol-woods'
OUT.mkdir(parents=True,exist_ok=True)
W,H=1080,1350
navy='#101f30'; ivory='#f8f5ec'; teal='#087b78'; amber='#f2c478'; muted='#bccbd5'
class Poster:
 def __init__(self,n,title,sub):
  self.n=n; self.im=Image.new('RGB',(W,H),navy);self.d=ImageDraw.Draw(self.im);self.svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img"><title>{escape(title)}</title><rect width="1080" height="1350" fill="{navy}"/>']
  self.text(64,48,'KAPUKAI  /  CAROL WOODS  /  '+n[:2],22,amber)
  y=self.text(64,112,title,54,ivory,29,bold=True)
  self.text(64,y+20,sub,22,muted,82)
 def text(self,x,y,s,size=28,color=ivory,width=58,bold=False):
  font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf',size)
  for line in textwrap.wrap(s,width):
   self.d.text((x,y),line,font=font,fill=color)
   self.svg.append(f'<text x="{x}" y="{y+size}" fill="{color}" font-family="DejaVu Sans,sans-serif" font-size="{size}" font-weight="{700 if bold else 400}">{escape(line)}</text>');y+=size*1.35
  return y
 def box(self,x,y,w,h,fill):
  self.d.rounded_rectangle((x,y,x+w,y+h),12,fill=fill);self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}"/>')
 def arrow(self,x,y,length=46):
  self.d.line((x,y,x,y+length),fill=amber,width=4);self.d.polygon([(x,y+length),(x-9,y+length-13),(x+9,y+length-13)],fill=amber)
  self.svg.append(f'<path d="M{x} {y}v{length}m-9 -13l9 13 9 -13" fill="none" stroke="{amber}" stroke-width="4"/>')
 def end(self,source):
  self.text(64,1193,source,20,muted,84)
  self.text(64,1288,'kapukai.org/evidence/carol-woods/',22,amber,80)
  (OUT/'visuals'/f'{self.n}.svg').write_text(''.join(self.svg)+'</svg>')
  self.im.save(OUT/'visuals'/f'{self.n}.png')
p=Poster('01-record-to-consequence','A record can change a life.','What verifies the record? A risk pathway illustrated by Woods’s testimony, not a proven reconstruction of a case.')
steps=[('01  THE SOURCE','Woods says records appeared without a source she could identify.','Transcript 01:18–01:45'),('02  THE FILE','She alleges pressure to change a child’s file in the authority’s favor.','Transcript 05:23–05:52'),('03  THE COURT','She alleges crucial documents were removed and altered material reached court.','Transcript 11:15–11:54')]
for i,(a,b,c) in enumerate(steps):
 y=360+i*218;p.box(64,y,952,178,'#203448');p.text(88,y+16,a,25,amber,bold=True);p.text(88,y+57,b,29,ivory,56);p.text(88,y+139,c,20,muted)
 if i<2:p.arrow(540,y+181,33)
p.text(64,1035,'If the record is wrong, every decision that relies on it needs review.',36,ivory,42,True)
p.end('Source: Kapukai-hosted UK Column interview transcript. Allegations have not been independently established by this visual; audio alignment remains to be checked.')
p=Poster('02-follow-the-money','Follow the decision. Follow the money.','The care placements economy is documented. A financial motive in a particular custody decision requires separate evidence.')
for i,(a,b) in enumerate([('PUBLIC FUNDS','Local authorities purchase care placements.'),('PLACEMENT PAYMENTS','Independent providers receive payment for care.'),('PROVIDER REVENUE','Some providers operate for profit.')]):
 y=350+i*178;p.box(64,y,952,136,'#203448');p.text(88,y+17,a,25,amber,bold=True);p.text(88,y+62,b,29,ivory,55)
 if i<2:p.arrow(540,y+139,33)
p.box(64,910,952,224,teal);p.text(88,929,'22.6%',72,ivory,bold=True);p.text(390,943,'Average operating margin',28,ivory,35,True);p.text(390,985,'Children’s homes providers in the CMA sample, 2016–2020.',25,ivory,37)
p.text(88,1050,'This is not a payment for removing a child and does not establish Woods’s allegations.',24,ivory,66)
p.end('Source: CMA, Children’s social care market study, final report (10 March 2022), Summary. Historical sample; not a current sector-wide estimate.')
p=Poster('03-verify-before-impact','Verification must keep pace with power.','Kapukai proposal: evidence checks at the decision point, with urgent protection and rapid independent review when needed.')
rows=[('SOURCE','Who observed it? When? Where is the original?'),('CHANGE','Who edited it? What changed? Why?'),('CHALLENGE','What contradicts it? Has the affected person responded?'),('DECISION','Who acted? Under what authority and evidence?'),('CORRECTION','Who must recheck decisions when evidence changes?')]
for i,(a,b) in enumerate(rows):
 y=355+i*140;p.box(64,y,952,116,'#203448');p.text(86,y+16,a,22,amber,bold=True);p.text(86,y+51,b,28,ivory,57)
p.text(64,1085,'Protect the person. Expose the decision.',35,ivory,48,True)
p.end('Design proposal, not an operating verification service. Publish reviewable reasons and evidence status while protecting children and private records.')
