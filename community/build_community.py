from pathlib import Path
from build_frontend import page, P, ORIGIN, public_path
import json

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

page('community', 'Join, volunteer and learn', 'Sign up for free classes and webinars coming soon, volunteer opportunities, collaboration or The Remedy Brief. Choose each interest separately.', '''
<div class="layout"><section><p class="eyebrow">A place to contribute</p><h1>Your curiosity.<br>Your skills.<br>Your choice.</h1><p class="lede">Join Kapukai for learning and practical work on systems people can inspect, question and correct.</p><div class="notice"><strong>Free classes and webinars are coming soon.</strong><br>We will announce dates and registration details. This is an interest list, not a booked place.</div><h2>Volunteers welcome.</h2><p>Help test tools, check public sources, improve accessible learning materials, or express interest in independent observation.</p><p>Volunteer assignments and any access to private information require separate onboarding and consent. Observing a person give an account does not verify every event described.</p><p>Want to collaborate or teach? Choose “Connect with Kapukai.” We can follow up about your interests.</p><p class="small">No payment or sensitive history is needed. This form is for adults 18 and older. Kapukai is not a law firm and does not provide legal advice.</p><p><a href="/articles/tort-law-and-accountability/">Read the article that started this invitation</a></p></section>
<section class="panel" id="signup"><h2>Choose how to take part.</h2><p>Enter your email, choose your interests, and confirm the link we send.</p><form id="signup-form" data-source="/community"><div class="field"><label for="email">Email address</label><input type="email" id="email" name="email" autocomplete="email" maxlength="254" required></div><fieldset><legend>Email me about (choose at least one)</legend>
<label class="check"><input type="checkbox" name="topic" value="free_classes"><span><strong>Free classes and webinars</strong><br>Dates and registration details when announced.</span></label>
<label class="check"><input type="checkbox" name="topic" value="volunteer"><span><strong>Volunteer opportunities</strong><br>Invitations to contribute, with each role explained.</span></label>
<label class="check"><input type="checkbox" name="topic" value="connect"><span><strong>Connect with Kapukai</strong><br>Follow up about collaboration, teaching or contributing.</span></label>
<label class="check"><input type="checkbox" name="topic" value="tester_invites"><span><strong>Tool testing</strong><br>Invitations to test with fictional practice cases.</span></label>
<label class="check"><input type="checkbox" name="topic" value="remedy_brief"><span><strong>The Remedy Brief</strong><br>Articles and practical proposals, at your chosen pace.</span></label></fieldset>
<fieldset id="tool-choices"><legend>Optional testing interests</legend><div class="tools"><label class="check"><input type="checkbox" name="tool" value="affidavit">Affidavit drafting</label><label class="check"><input type="checkbox" name="tool" value="timeline">Timelines</label><label class="check"><input type="checkbox" name="tool" value="evidence_dossier">Evidence organization</label></div></fieldset>
<div class="field" id="cadence-field"><label for="cadence">Newsletter frequency</label><select name="cadence" id="cadence"><option value="monthly">Monthly digest</option><option value="every_other_week">Every other week</option></select></div>
<label class="check"><input type="checkbox" id="adult" required><span>I am 18 or older, agree to email about the interests I selected, and have read the <a href="/privacy/">signup privacy notice</a>.</span></label>
<div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><button class="full" type="submit">Send my confirmation link</button><p id="status" class="status" role="status" aria-live="polite"></p></form><noscript><p>Enable JavaScript to submit this form, or email <a href="mailto:architect@kapukai.org">architect@kapukai.org</a> with your selected interests.</p></noscript><p class="small">Your choices are private. No login needed. Use the private confirmation link to withdraw these choices later, or contact us. Please do not send case documents here.</p></section></div>
''')

from workshop_pages import build_workshop
build_workshop(page)
from lifecycle_pages import build_lifecycle
build_lifecycle(page)

routes=[public_path(x) for x in ['','community','testers','newsletter','practice','privacy',ARTICLE]] + ['community/'+x for x in ['assistance','reviewers','learn','about','contact','status','lifecycle']]
(P/'community'/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+ORIGIN+('/'+route+'/' if route else '/')+'</loc></url>' for route in routes)+'</urlset>')
(P/'robots.txt').write_text('User-agent: *\nAllow: /\nDisallow: /confirm/\nDisallow: /community/apply/\nDisallow: /community/operate/\nSitemap: '+ORIGIN+'/community/sitemap.xml\n')
print('Article, community signup, homepage and discovery metadata built.')

import shutil
assets_out=P/'assets'/'community'
assets_out.mkdir(parents=True,exist_ok=True)
for name in ['style.css','app.js','applications.js','operations.js','favicon.svg']: shutil.copy(Path(__file__).parent/'assets'/name, assets_out/name)
for route,target in [('', '/community/'), ('tort','/articles/tort-law-and-accountability/')]:
    d=P/route;d.mkdir(parents=True,exist_ok=True)
    (d/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url='+target+'"><title>Kapukai Governance Lab</title><link rel="canonical" href="'+ORIGIN+target+'"><a href="'+target+'">Continue to Kapukai</a></html>')

# Repair the public contact destination without replacing the primary homepage.
contact=P/'contact';contact.mkdir(parents=True,exist_ok=True)
contact.joinpath('index.html').write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/community/contact/"><title>Contact Kapukai</title><link rel="canonical" href="https://kapukai.org/community/contact/"></head><body><p><a href="/community/contact/">Contact Kapukai Governance Lab</a></p></body></html>')
