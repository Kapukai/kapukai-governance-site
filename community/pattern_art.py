"""Deterministic Kapukai pattern cards (SVG masters and compact PNG exports).

API: generate_cards(data, outdir) -> list of output metadata dictionaries.
``data`` is a list of pattern dictionaries. Required keys are id, title, insight,
observe, measure, repair, tradeoff and source_ids; slug is optional. Source IDs
are preserved in SVG metadata; source references belong to the companion page.

Fonts: DejaVu Sans, DejaVu Sans Bold, and DejaVu Serif. Pillow measures text.
CairoSVG is preferred for rasterization; installed Node/Sharp is a fallback.
No supplied prose is truncated. Overlong text raises a precise ValueError.
"""
from __future__ import annotations

import argparse
import html
import importlib.util
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageFont

WIDTH, HEIGHT = 1080, 1350
PAPER, NAVY, TEAL, GOLD = '#F8F6F0', '#142D42', '#17665D', '#B58C45'
MUTED, LINE, WHITE = '#526271', '#D7DFDC', '#FFFDFA'
RED, RED_FILL, TEAL_FILL = '#A33D36', '#F5E3DE', '#E5EEE8'
FONT_ROOT = Path('/usr/share/fonts/truetype/dejavu')
FONT_PATHS = {
    'sans': FONT_ROOT / 'DejaVuSans.ttf',
    'bold': FONT_ROOT / 'DejaVuSans-Bold.ttf',
    'serif': FONT_ROOT / 'DejaVuSerif.ttf',
}
DEFAULT_SLUGS = {
    'P01': 'correction-reach', 'P02': 'unowned-handoff',
    'P03': 'copied-corroboration', 'P04': 'label-escalation',
    'P05': 'closure-without-repair', 'P06': 'burden-and-protection',
    'P07': 'separation-and-feedback', 'P08': 'metrics-shape-choices',
}


def _font(size, family='sans'):
    path = FONT_PATHS[family]
    if not path.is_file():
        raise RuntimeError(f'Required font missing: {path}')
    return ImageFont.truetype(str(path), size)


def _wrap(value, width, size, family='sans'):
    font = _font(size, family)
    result = []
    for paragraph in str(value).split('\n'):
        current = ''
        for word in paragraph.split():
            if font.getlength(word) > width:
                raise ValueError(f'Word too wide at {size}px: {word!r}')
            candidate = f'{current} {word}'.strip()
            if current and font.getlength(candidate) > width:
                result.append(current)
                current = word
            else:
                current = candidate
        result.append(current)
    return result


class Card:
    def __init__(self, pattern):
        self.pattern = pattern
        self.parts = []
        self.bounds = []

    def add(self, markup):
        self.parts.append(markup)

    def rect(self, x, y, w, h, fill=WHITE, stroke=LINE, radius=10, dash=None, sw=1.6):
        dashed = f' stroke-dasharray="{dash}"' if dash else ''
        self.add(f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="{radius:g}" fill="{fill}" stroke="{stroke}" stroke-width="{sw:g}"{dashed}/>')

    def path(self, points, color=NAVY, arrow=True, dash=None, sw=2.5):
        d = 'M ' + ' L '.join(f'{x:g} {y:g}' for x, y in points)
        marker = f' marker-end="url(#{"repair" if color == TEAL else "failure" if color == RED else "flow"}-arrow)"' if arrow else ''
        dashed = f' stroke-dasharray="{dash}"' if dash else ''
        self.add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw:g}" stroke-linejoin="round"{marker}{dashed}/>')

    def text(self, value, x, y, width, size=28, family='sans', color=NAVY,
             align='start', leading=None, max_lines=None, label='text'):
        if size < 28:
            raise ValueError('Visible text must be at least 28px.')
        lines = _wrap(value, width, size, family)
        if max_lines and len(lines) > max_lines:
            raise ValueError(f'{self.pattern["id"]} {label}: {len(lines)} lines at {size}px; maximum {max_lines}.')
        leading = leading or round(size * 1.2)
        font = _font(size, family)
        measured = max(font.getlength(s) for s in lines)
        left = x - measured / 2 if align == 'middle' else x
        right = left + measured
        bottom = y + (len(lines) - 1) * leading + size * .25
        top = y - size
        if left < -0.5 or right > WIDTH + .5 or top < 0 or bottom > HEIGHT:
            raise ValueError(f'{self.pattern["id"]} {label} exceeds card bounds: {(left, top, right, bottom)}')
        self.bounds.append({'label': label, 'x': round(left, 2), 'y': round(top, 2), 'right': round(right, 2), 'bottom': round(bottom, 2), 'font_size': size})
        family_name = 'DejaVu Serif' if family == 'serif' else 'DejaVu Sans'
        weight = '700' if family == 'bold' else '400'
        spans = ''.join(f'<tspan x="{x:g}" dy="{0 if i == 0 else leading:g}">{html.escape(s)}</tspan>' for i, s in enumerate(lines))
        self.add(f'<text x="{x:g}" y="{y:g}" font-family="{family_name}" font-size="{size}" font-weight="{weight}" text-anchor="{align}" fill="{color}">{spans}</text>')
        return len(lines)

    def fit_text(self, value, x, y, width, sizes, max_lines, **kwargs):
        family = kwargs.get('family', 'sans')
        for size in sizes:
            if len(_wrap(value, width, size, family)) <= max_lines:
                return self.text(value, x, y, width, size=size, max_lines=max_lines, **kwargs)
        raise ValueError(f'{self.pattern["id"]} {kwargs.get("label", "text")} exceeds {max_lines} lines even at {sizes[-1]}px: {value}')


class Diagram:
    """Local diagram coordinates are 952×400; y geometry compresses to 340px.
    Text remains unscaled at 28px or larger.
    """
    def __init__(self, card):
        self.c = card
        self.x, self.y, self.sy = 64, 300, .85

    def point(self, x, y):
        return self.x + x, self.y + y * self.sy

    def path(self, points, **kwargs):
        self.c.path([self.point(x, y) for x, y in points], **kwargs)

    def node(self, x, y, w, h, value, kind='neutral', dashed=False):
        if min(x, y) < 0 or x + w > 952 or y + h > 400:
            raise ValueError(f'{self.c.pattern["id"]}: node exceeds diagram bounds.')
        fills = {'neutral': WHITE, 'repair': TEAL_FILL, 'failure': RED_FILL, 'muted': '#ECEEE8'}
        strokes = {'neutral': LINE, 'repair': TEAL, 'failure': RED, 'muted': LINE}
        px, py = self.point(x, y)
        self.c.rect(px, py, w, h * self.sy, fills[kind], strokes[kind], dash='7 6' if dashed else None)
        lines = _wrap(value, w - 24, 28)
        leading = 32
        if len(lines) * leading > h * self.sy + 2:
            raise ValueError(f'{self.c.pattern["id"]}: node label is too tall: {value!r}')
        baseline = py + h * self.sy / 2 - (len(lines) - 1) * leading / 2 + 9
        self.c.text(value, px + w / 2, baseline, w - 24, align='middle', leading=leading, label='diagram node')

    def text(self, value, x, y, width, color=MUTED, align='middle', size=28):
        px, py = self.point(x, y)
        self.c.text(value, px, py, width, size=size, color=color, align=align, label='diagram label')

    def label(self, value, x, y, width, color=MUTED):
        px, py = self.point(x, y)
        lines = _wrap(value, width, 28)
        font = _font(28)
        measured = max(font.getlength(t) for t in lines)
        self.c.rect(px - measured / 2 - 7, py - 29, measured + 14, len(lines) * 34 + 2, PAPER, PAPER, radius=2, sw=0)
        self.c.text(value, px, py, width, color=color, align='middle', leading=34, label='diagram edge label')


def _p01(d):
    d.path([(220,176),(282,176),(282,68),(350,68)])
    d.path([(220,176),(282,176),(282,295),(350,295)], color=RED)
    d.path([(580,68),(650,68),(650,162),(715,162)])
    d.path([(580,295),(650,295),(650,190),(715,190)], color=RED)
    d.path([(117,224),(117,379),(465,379),(465,344)], color=TEAL)
    d.node(15,128,205,96,'Corrected\nsource','repair')
    d.node(350,20,230,96,'Recipient A\nupdated','repair')
    d.node(350,247,230,96,'Recipient B\nold copy','failure')
    d.node(715,128,222,96,'Consequence\npersists','failure')
    d.label('Send + verify',286,385,300,TEAL)


def _p02(d):
    d.path([(255,95),(354,95)])
    d.path([(595,95),(704,95)], color=RED, dash='7 6')
    d.path([(475,145),(475,244)], color=TEAL)
    d.path([(620,300),(820,300),(820,146)], color=TEAL)
    d.node(15,45,240,100,'Sending\noffice')
    d.node(355,45,240,100,'Who owns\nthe next step?','failure',True)
    d.node(705,45,230,100,'Receiving\noffice')
    d.node(255,245,365,110,'Owner + deadline\n+ acceptance','repair')
    d.label('Assign',475,210,160,TEAL)
    d.label('Accept',820,218,180,TEAL)


def _p03(d):
    for y in [58,196,334]:
        d.path([(235,196),(298,196),(298,y),(354,y)])
        d.path([(575,y),(635,y),(635,196),(699,196)])
    d.node(15,146,220,100,'One original\nassertion')
    d.node(355,15,220,86,'Copy A1')
    d.node(355,153,220,86,'Copy A2')
    d.node(355,291,220,86,'Copy A3')
    d.node(700,146,237,100,'One source,\nthree copies','muted')
    d.text('Trace origins',122,332,240,TEAL)


def _p04(d):
    xs = [15,260,505,750]
    for i in range(3):
        d.path([(xs[i]+185,112),(xs[i+1]-1,112)], color=RED if i > 0 else NAVY, dash='6 5' if i == 1 else None)
    d.path([(352,160),(285,230),(285,312),(334,312)], color=TEAL)
    d.path([(635,312),(690,312),(690,230),(597,230),(597,161)], color=TEAL)
    for x,value,kind in [(15,'Reported','neutral'),(260,'Recorded','neutral'),(505,'Treated\nas fact','failure'),(750,'Action','failure')]:
        d.node(x,64,185,96,value,kind)
    d.node(335,268,300,88,'Evidence gate','repair')
    d.text('?',475,76,50,RED,size=32)
    d.label('No new support',475,214,340,RED)


def _p05(d):
    d.path([(265,70),(684,70)])
    d.path([(265,291),(354,291)], color=TEAL)
    d.path([(600,291),(684,291)], color=TEAL)
    d.path([(810,120),(810,242)], color=RED, dash='7 6')
    d.node(15,20,250,100,'Ticket\nopened')
    d.node(685,20,250,100,'Ticket\nclosed')
    d.node(15,243,250,96,'Access\nblocked','failure')
    d.node(355,243,245,96,'Test actual\noutcome','repair')
    d.node(685,243,250,96,'Still\nblocked','failure')
    d.label('Status changed',475,59,340)
    d.label('Not a repair test',801,199,280,RED)


def _p06(d):
    c=d.c; x,y=d.point(170,15); w,h=720,285*d.sy
    c.rect(x,y,360,h/2,TEAL_FILL,LINE,radius=0)
    c.rect(x+360,y,360,h/2,WHITE,LINE,radius=0)
    c.rect(x,y+h/2,360,h/2,WHITE,LINE,radius=0)
    c.rect(x+360,y+h/2,360,h/2,RED_FILL,LINE,radius=0)
    for tx,ty,value in [(350,70,'Lower burden\nStronger protection'),(710,70,'Higher burden\nStronger protection'),(350,212,'Lower burden\nWeaker protection'),(710,212,'Higher burden\nWeaker protection')]:
        d.text(value,tx,ty,330,color=NAVY)
    d.path([(170,319),(890,319)], color=NAVY)
    d.text('Burden increases',530,360,650)
    px,py=d.point(73,160)
    c.add(f'<text x="{px:g}" y="{py:g}" transform="rotate(-90 {px:g} {py:g})" font-family="DejaVu Sans" font-size="28" text-anchor="middle" fill="{MUTED}">Protection increases</text>')
    d.path([(119,299),(119,16)], color=NAVY)
    d.text('Conceptual axes; no agencies plotted',530,399,800)


def _p07(d):
    d.path([(255,173),(290,173),(290,66),(354,66)])
    d.path([(615,66),(822,66),(822,145)])
    d.path([(255,197),(290,197),(290,308),(354,308)], color=TEAL)
    d.path([(615,308),(822,308),(822,237)], color=TEAL)
    d.path([(710,218),(650,218),(256,218)], color=TEAL)
    d.node(15,145,240,96,'Concern +\nevidence')
    d.node(355,15,260,102,'Independent\nreview','repair')
    d.node(355,260,260,96,'Authorized\npause?','repair',True)
    d.node(710,145,227,96,'Lawful\naction owner')
    d.label('Findings',800,48,190)
    d.label('Repair receipt',486,210,300,TEAL)
    d.text('Only where law allows',486,399,480,TEAL)


def _p08(d):
    pts=[(15,25),(355,25),(695,25),(695,268),(355,268),(15,268)]
    for a,b in [(0,1),(1,2)]:
        d.path([(pts[a][0]+240,75),(pts[b][0]-1,75)])
    d.path([(815,125),(815,267)])
    for a,b in [(3,4),(4,5)]:
        d.path([(pts[a][0],318),(pts[b][0]+241,318)], color=TEAL)
    d.path([(135,268),(135,126)], color=TEAL)
    labels=['Chosen\nmetric','Behavior\nadapts','Human\neffect','Measure\nactual effect','Check for\nblind spots','Revise\nthe metric']
    for i,((x,y),label) in enumerate(zip(pts,labels)):
        d.node(x,y,240,100,label,'repair' if i>2 else 'neutral')
    d.label('Feedback',475,205,400,TEAL)


DIAGRAMS = {'P01': _p01, 'P02': _p02, 'P03': _p03, 'P04': _p04,
            'P05': _p05, 'P06': _p06, 'P07': _p07, 'P08': _p08}


def _svg(pattern):
    c=Card(pattern)
    c.add(f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{PAPER}"/>')
    c.text('ILLUSTRATIVE PATTERN',64,55,780,size=28,family='bold',color=TEAL,label='eyebrow')
    c.text(pattern['id'],984,55,100,size=28,family='bold',align='middle',color=TEAL,label='pattern ID')
    c.rect(64,76,88,4,GOLD,GOLD,radius=0,sw=0)
    c.fit_text(pattern['title'],64,137,952,[50,48,46,44,42],2,family='serif',leading=58,label='title')
    c.fit_text(pattern['insight'],64,233,952,[31,30,29,28],2,color=MUTED,leading=37,label='insight')
    DIAGRAMS[pattern['id']](Diagram(c))
    c.path([(64,675),(1016,675)],color=LINE,arrow=False,sw=1.5)
    for field,y in [('observe',721),('measure',841),('repair',961),('tradeoff',1081)]:
        c.text(field.capitalize(),64,y,175,size=28,family='bold',color=TEAL if field=='repair' else NAVY,label=field+' label')
        c.fit_text(pattern[field],248,y,768,[30,29,28],3,leading=35,label=field)
    c.path([(64,1189),(1016,1189)],color=LINE,arrow=False,sw=1.5)
    c.text('Conceptual pattern • Proposed tests',64,1224,952,size=28,color=MUTED,label='footer scope')
    c.text('Kapukai Governance Lab • v1.0',64,1263,952,size=28,color=NAVY,label='footer brand')
    source_url='https://kapukai-community.vercel.app/architecture-of-power/patterns/#'+pattern['id'].lower()
    c.add(f'<a href="{html.escape(source_url,quote=True)}" aria-label="Source notes for {pattern["id"]}">')
    c.text('Source notes: Kapukai Visual Pattern Library · '+pattern['id'],64,1302,952,size=28,color=TEAL,label='footer source pointer')
    c.add('</a>')
    defs=''.join(f'<marker id="{key}-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8Z" fill="{color}"/></marker>' for key,color in [('flow',NAVY),('repair',TEAL),('failure',RED)])
    desc=pattern.get('image_description') or f'Illustrative {pattern["id"]} diagram; proposed observation, measurement, repair and tradeoff. No agency data is plotted.'
    metadata={'id':pattern['id'],'title':pattern['title'],'source_ids':pattern['source_ids'],'source_notes_url':source_url,'claim_type':'conceptual illustration and proposed tests','verification_state':'not an empirical finding','version':'1.0'}
    result=f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="card-title card-desc"><title id="card-title">{html.escape(pattern["id"]+": "+pattern["title"])}</title><desc id="card-desc">{html.escape(desc)}</desc><metadata>{html.escape(json.dumps(metadata,ensure_ascii=False))}</metadata><defs>{defs}</defs>'+''.join(c.parts)+'</svg>\n'
    return result,c.bounds


def _rasterize(svg_path, png_path):
    if importlib.util.find_spec('cairosvg'):
        import cairosvg
        cairosvg.svg2png(url=str(svg_path),write_to=str(png_path),output_width=WIDTH,output_height=HEIGHT)
        renderer='cairosvg'
    else:
        node=os.environ.get('CODEX_PRIMARY_RUNTIME_NODE') or shutil.which('node')
        if not node:
            raise RuntimeError('PNG export needs CairoSVG or Node with Sharp.')
        modules=os.environ.get('CODEX_PRIMARY_RUNTIME_NODE_MODULES','')
        sharp_path=str(Path(modules)/'sharp') if modules else 'sharp'
        script="const sharp=require(process.argv[1]);sharp(process.argv[2]).png({compressionLevel:9}).toFile(process.argv[3]).catch(e=>{console.error(e);process.exit(1)});"
        subprocess.run([node,'-e',script,sharp_path,str(svg_path),str(png_path)],check=True,capture_output=True,text=True)
        renderer='sharp'
    with Image.open(png_path) as image:
        image.convert('RGB').quantize(colors=256,method=Image.Quantize.MEDIANCUT).save(png_path,optimize=True,compress_level=9)
    return renderer


def generate_cards(data, outdir):
    """Write ``p01-slug.svg/.png`` and return per-card output metadata.

    Exact input copy is preserved. Diagram labels are stable conceptual labels,
    not empirical findings. The function writes only beneath ``outdir``.
    """
    if not isinstance(data,list):
        raise TypeError('data must be a list of pattern dictionaries')
    outdir=Path(outdir);outdir.mkdir(parents=True,exist_ok=True)
    result=[];seen=set()
    required=['id','title','insight','observe','measure','repair','tradeoff','source_ids']
    for pattern in data:
        missing=[key for key in required if key not in pattern]
        if missing:raise ValueError(f'Missing pattern fields: {missing}')
        pid=pattern['id']
        if pid not in DIAGRAMS or pid in seen:raise ValueError(f'Unsupported or duplicate pattern ID: {pid}')
        seen.add(pid)
        slug=pattern.get('slug',DEFAULT_SLUGS[pid])
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',slug):raise ValueError(f'Invalid slug: {slug}')
        name=f'{pid.lower()}-{slug}'
        svg_path,png_path=outdir/(name+'.svg'),outdir/(name+'.png')
        svg,bounds=_svg(pattern)
        svg_path.write_text(svg,encoding='utf-8')
        renderer=_rasterize(svg_path,png_path)
        result.append({'id':pid,'slug':slug,'svg':str(svg_path),'png':str(png_path),'width':WIDTH,'height':HEIGHT,'png_bytes':png_path.stat().st_size,'renderer':renderer,'minimum_font_size':min(b['font_size'] for b in bounds),'text_bounds':bounds})
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    payload=json.loads(args.data.read_text(encoding='utf-8'))
    patterns=payload['patterns'] if isinstance(payload,dict) else payload
    report=generate_cards(patterns,args.out)
    print(json.dumps([{k:v for k,v in item.items() if k!='text_bounds'} for item in report],indent=2))
