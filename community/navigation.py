"""Existing learning destinations; change origins only after hosted verification."""
from html import escape

PLATFORM_ORIGIN = "https://kapukai-marketplace-pilot-git-work-pub-d328a2-kapukais-projects.vercel.app"
CLASSROOM_URL = PLATFORM_ORIGIN + "/first-circle/classroom"
WEBINARS_URL = PLATFORM_ORIGIN + "/first-circle/webinars"

def learning_navigation(path):
    links = [("/community/", "Workshop", path == "community"),
             (CLASSROOM_URL, "Classroom", False),
             (WEBINARS_URL, "Webinars", False),
             ("/join/", "Email updates", path == "join")]
    items = "".join('<a href="' + escape(url, quote=True) + '"' +
                    (' aria-current="page"' if current else '') + '>' + label + '</a>'
                    for url, label, current in links)
    return '<nav class="learning-navigation" aria-label="Learning and participation">' + items + '</nav>'
