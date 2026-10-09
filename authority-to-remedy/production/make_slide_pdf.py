from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader

ROOT=Path('/workspace/scratch/ceefc48769f1/rights_to_remedy_work')
render_dir=ROOT/'slides_build'/'renders'
target=ROOT/'Kapukai_Authority_to_Remedy_Lesson_01.pdf'
slides=sorted(render_dir.glob('slide-*.png'))
assert len(slides)==18, len(slides)
c=canvas.Canvas(str(target),pagesize=(960,540),pageCompression=1)
c.setTitle('Kapukai Authority to Remedy Trace - Lesson 01')
c.setAuthor('Kapukai Governance Lab')
c.setSubject('Trace one consequential decision through authority, predicates, procedure, and verified remedy')
for p in slides:
    c.drawImage(ImageReader(str(p)),0,0,width=960,height=540)
    c.showPage()
c.save()
pdf=PdfReader(str(target))
assert len(pdf.pages)==18
print(target)
