#!/usr/bin/env python3
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1] / 'public' / 'evidence'
data = json.loads((root / 'public-data.json').read_text())
(root / 'public-data.js').write_text('window.KAPUKAI_PUBLIC_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + ';\n')
print('Synchronized public-data.js with public-data.json')
