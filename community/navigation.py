"""One public-navigation source for the header, footer and sitemap."""
from html import escape

PLATFORM_ORIGIN = 'https://kapukai-marketplace-pilot-git-work-pub-d328a2-kapukais-projects.vercel.app'
CLASSROOM_URL = PLATFORM_ORIGIN + '/first-circle/classroom'
WEBINARS_URL = PLATFORM_ORIGIN + '/first-circle/webinars'

def link(href, label, description):
    return dict(href=href, label=label, description=description)

NAV_GROUPS = (
    {'label': 'Tools', 'description': 'Practice and test with clear boundaries.', 'links': (
        link('/community/practice/', 'Practice cases', 'Free fictional records and expected results'),
        link('/testers/', 'Tester Circle', 'Apply for future tool-testing invitations'),
        link('/architecture-of-power/patterns/', 'Pattern library', 'Inspect failure patterns and proposed tests'),
    )},
    {'label': 'Explore', 'description': 'Inspect the work and its sources.', 'links': (
        link('/architecture-of-power/', 'Architecture of Power', 'Research, sources and design questions'),
        link('/architecture-of-power/atlas/', 'Institutional atlas', 'Explore authority, review and correction'),
        link('https://kapukai.org/bills/', 'Bills & proposals', 'Browse model legislation and source files'),
        link('https://kapukai.org/bills/michigan/', 'Michigan companion', 'Official bills and Kapukai’s separate proposals'),
    )},
    {'label': 'Learn', 'description': 'Build understanding before taking action.', 'links': (
        link('/community/learn/', 'Learning & sessions', 'Find learning resources and current availability'),
        link('/newsletter/', 'The Remedy Brief', 'Choose a public-research email subscription'),
        link('/articles/tort-law-and-accountability/', 'Featured article', 'Tort law, evidence and accountability'),
    )},
    {'label': 'Participate', 'description': 'Choose a useful way to contribute.', 'links': (
        link('/community/', 'The Workshop', 'Start here and choose your next step'),
        link('/community/assistance/', 'Request assistance', 'Ask about bounded support and availability'),
        link('/community/reviewers/', 'Review & witness', 'Apply to contribute your skills'),
        link('/join/', 'Email updates', 'Choose separate topics and confirm your email'),
    )},
    {'label': 'About', 'description': 'Understand the lab and its commitments.', 'links': (
        link('/community/about/', 'About the lab', 'Purpose, scope and current boundaries'),
        link('/community/status/', 'Service status', 'What is available and what is in development'),
        link('/community/lifecycle/', 'How participation works', 'Requests, review, delivery and correction'),
        link('/community/contact/', 'Contact', 'Questions and the website directory'),
        link('/community/privacy/', 'Privacy & your choices', 'Consent, withdrawal and data requests'),
    )},
)

def _current(url, path):
    return url.startswith('/') and url.strip('/') == path.strip('/')

def nav_link(item, path, descriptive=False):
    current = ' aria-current="page"' if _current(item['href'], path) else ''
    detail = '<span>' + escape(item['description']) + '</span>' if descriptive else ''
    return '<a href="' + escape(item['href'], quote=True) + '"' + current + '><strong>' + escape(item['label']) + '</strong>' + detail + '</a>'

def site_header(path):
    groups = []
    for group in NAV_GROUPS:
        active = any(_current(item['href'], path) for item in group['links'])
        links = ''.join('<li>' + nav_link(item, path, True) + '</li>' for item in group['links'])
        groups.append('<details class="nav-group' + (' nav-group-current' if active else '') + '"><summary>' + group['label'] + '</summary><div class="nav-panel"><p>' + escape(group['description']) + '</p><ul>' + links + '</ul></div></details>')
    member_current = ' aria-current="page"' if path == 'community/members' else ''
    return '''<header class="site-header"><div class="site-header-inner">
<a class="brand" href="https://kapukai.org/" aria-label="Kapukai Governance Lab home"><img src="/assets/community/favicon.svg" alt="" width="40" height="40"><span>KAPUKAI<small>Governance Lab</small></span></a>
<details class="site-menu" open><summary class="site-menu-toggle">Menu <span aria-hidden="true">+</span></summary><nav class="global-navigation" aria-label="Main">''' + ''.join(groups) + '''</nav></details>
<div class="site-utilities"><a class="member-entry" href="/community/members/"''' + member_current + '''>Member sign in</a><a class="nav-cta" href="/community/">Get involved <span aria-hidden="true">↗</span></a></div>
</div></header>'''

def contextual_navigation(path, title):
    trail = '<li><a href="https://kapukai.org/">Home</a></li>'
    if path.startswith('community/'):
        trail += '<li><a href="/community/">Workshop</a></li>'
    elif path.startswith('architecture-of-power/'):
        trail += '<li><a href="/architecture-of-power/">Architecture of Power</a></li>'
    trail += '<li><span aria-current="page">' + escape(title) + '</span></li>'
    return '<div class="site-context"><nav aria-label="Breadcrumb"><ol>' + trail + '</ol></nav><a class="site-directory-link" href="/community/sitemap/">Browse all pages <span aria-hidden="true">↗</span></a></div>'

def site_footer(path, privacy_link):
    groups = []
    for group in NAV_GROUPS:
        items = ''.join('<li>' + nav_link(item, path) + '</li>' for item in group['links'])
        groups.append('<div class="footer-group"><h2>' + group['label'] + '</h2><ul>' + items + '</ul></div>')
    return '''<footer class="site-footer"><div class="footer-intro"><div><p class="footer-name">Kapukai Governance Lab</p><p>Protect the person. Expose the decision.</p></div><p class="footer-scope">Engineering tools, learning and public systems research.<br>See each resource’s evidence, scope and release status.</p></div><nav class="footer-navigation" aria-label="Footer">''' + ''.join(groups) + '''</nav><div class="footer-bottom"><span>Truth as a Public Utility</span><div><a href="/community/sitemap/">Sitemap</a>''' + ' · ' + privacy_link + ''' · <a href="mailto:architect@kapukai.org">Email the lab</a></div></div></footer>'''

def learning_navigation(path):
    """Compatibility for older consumers; the new shell uses one shared menu."""
    return contextual_navigation(path, 'Learning and participation')
