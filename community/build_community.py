from pathlib import Path
from build_frontend import page, P, ORIGIN, public_path
import json

# Join and its signup behavior are authored in public/ and deployed directly by
# Vercel. Keep release-specific copy, brand assets and confirmation recovery intact.
for authored in [P / 'join/index.html', P / 'assets/community/app.js']:
    if not authored.is_file():
        raise FileNotFoundError(f'Missing authored signup file: {authored}')

TITLE = 'When power causes harm, people need a way to push back'
ARTICLE = 'articles/tort-law-and-accountability'
page(ARTICLE, TITLE, 'Tort law as decentralized accountability, and how engineering can help people build inspectable evidence. By Christine Hillier.', Path('article-body.html').read_text(), False)
article_path = P / ARTICLE / 'index.html'
article = article_path.read_text().replace('content="website"', 'content="article"')
schema = {'@context':'https://schema.org','@type':'Article','headline':TITLE,'author':{'@type':'Person','name':'Christine Hillier'},'publisher':{'@type':'Organization','name':'Kapukai Governance Lab'},'datePublished':'2026-10-08','mainEntityOfPage':ORIGIN+'/'+ARTICLE+'/'}
article = article.replace('</head>', '<meta property="article:published_time" content="2026-10-08"><meta name="author" content="Christine Hillier"><script type="application/ld+json">'+json.dumps(schema)+'</script></head>')
article_path.write_text(article)

page('', 'Learn, connect and contribute', 'Join Kapukai for free classes and webinars coming soon, volunteer opportunities, tool testing and The Remedy Brief.', '''
<section class="home-intro"><p class="eyebrow">Kapukai Governance Lab · Truth as a Public Utility</p><h1>Learn. Connect.<br>Help build.</h1><p class="lede">Make public decisions easier to inspect, question and correct. Free classes and webinars are coming soon. Join for the opportunities you want.</p><a class="button" href="/join/#signup">Sign up, volunteer or connect</a><p class="small">Free to join. Email confirmation required. No case records or payment.</p></section>
<section class="featured-article"><div><p class="eyebrow">New article · The Remedy Brief</p><h2>When power causes harm, people need a way to push back.</h2><p>Tort law gives accountability another point of entry: the person harmed. Engineering can help make the evidence usable.</p><a href="/articles/tort-law-and-accountability/">Read Christine’s article</a></div><blockquote>Code can make an argument reproducible. It cannot make an unsupported argument true.</blockquote></section>
<div class="cards"><section class="panel"><p class="tag">Free learning · Coming soon</p><h2>Understand the record.</h2><p>Register interest in classes and webinars on evidence organization, source checking, and correction. Dates will be announced separately.</p><a href="/join/#signup">Get class and webinar notices</a></section><section class="panel"><p class="tag">Contribute your skills</p><h2>Help make tools useful.</h2><p>Volunteer, connect about collaboration, or help test document tools with fictional practice cases.</p><a href="/join/#signup">Choose how to take part</a></section></div>
<p class="divider">Already looking for something specific? <a href="/testers/">Tester Circle</a> · <a href="/newsletter/">The Remedy Brief</a> · <a href="/practice/">Free practice cases</a></p>
''', False)

from workshop_pages import build_workshop
build_workshop(page)
from lifecycle_pages import build_lifecycle
build_lifecycle(page)
from member_pages import build_members
build_members(page)
from architecture_page import build_architecture
build_architecture(page, P)
from architecture_atlas import build_atlas
build_atlas(page, P)
from pattern_library import build_patterns
build_patterns(page, P)

routes=[public_path(x) for x in ['','community','testers','newsletter','practice','privacy',ARTICLE]] + ['community/'+x for x in ['assistance','reviewers','learn','about','contact','status','lifecycle','voices']] + ['architecture-of-power', 'architecture-of-power/atlas', 'architecture-of-power/patterns']
(P/'community'/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+ORIGIN+('/'+route+'/' if route else '/')+'</loc></url>' for route in routes)+'</urlset>')
(P/'robots.txt').write_text('User-agent: *\nAllow: /\nDisallow: /confirm/\nDisallow: /community/apply/\nDisallow: /community/operate/\nDisallow: /community/members/\nSitemap: '+ORIGIN+'/community/sitemap.xml\n')
print('Article, community signup, homepage and discovery metadata built.')

import shutil
assets_out=P/'assets'/'community'
assets_out.mkdir(parents=True,exist_ok=True)
for name in ['style.css','applications.js','operations.js','members.js','members.css','favicon.svg']: shutil.copy(Path(__file__).parent/'assets'/name, assets_out/name)
for route,target in [('', '/community/'), ('tort','/articles/tort-law-and-accountability/')]:
    d=P/route;d.mkdir(parents=True,exist_ok=True)
    (d/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url='+target+'"><title>Kapukai Governance Lab</title><link rel="canonical" href="'+ORIGIN+target+'"><a href="'+target+'">Continue to Kapukai</a></html>')

# Repair the public contact destination without replacing the primary homepage.
contact=P/'contact';contact.mkdir(parents=True,exist_ok=True)
contact.joinpath('index.html').write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/community/contact/"><title>Contact Kapukai</title><link rel="canonical" href="https://kapukai.org/community/contact/"></head><body><p><a href="/community/contact/">Contact Kapukai Governance Lab</a></p></body></html>')
