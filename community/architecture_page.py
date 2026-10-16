"""Source-backed public systems analysis. No personal records or remote dependencies."""
from pathlib import Path
import shutil

BASE = Path(__file__).resolve().parent

def build_architecture(page, output):
    body = (BASE / 'architecture-body.html').read_text()
    body = body.replace('<!-- EVIDENCE_MAP -->', (BASE / 'architecture-map.html').read_text())
    page('architecture-of-power', 'The architecture of power',
         'Map how government decisions create consequences, where protection and correction fail, and how to reduce procedural burden without losing safeguards.',
         body, 'architecture-map.js')
    target = output / 'architecture-of-power/index.html'
    html = target.read_text().replace('content="website"', 'content="article"')
    html = html.replace('</head>', '<link rel="stylesheet" href="/assets/community/architecture.css"><link rel="stylesheet" href="/assets/community/architecture-map.css"><meta property="article:published_time" content="2026-10-16"></head>')
    html = html.replace('<body>', '<body class="architecture-site">')
    target.write_text(html)
    assets = output / 'assets/community'
    assets.mkdir(parents=True, exist_ok=True)
    for name in ['architecture.css', 'architecture-map.css', 'architecture-map.js', 'requirement-map.svg']:
        shutil.copy(BASE / 'assets' / name, assets / name)
