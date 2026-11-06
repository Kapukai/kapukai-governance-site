"""The public meeting CTA must use the public intro event in source and served pages."""
from html.parser import HTMLParser
from pathlib import Path
import sys
import unittest

COMMUNITY = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(COMMUNITY))
from workshop_pages import build_workshop

PUBLIC_EVENT = 'https://cal.com/kapukai-governance-lab/intro-call'
LABEL = 'Book a free 30-minute scoping call'
TERMS = 'Custom engineering is $250/hour after a written scope. Ask about ongoing monthly work during the call.'


class PublicPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.text, self.current = [], [], None

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current = [dict(attrs).get('href', ''), '']
            self.links.append(self.current)

    def handle_endtag(self, tag):
        if tag == 'a':
            self.current = None

    def handle_data(self, data):
        self.text.append(data)
        if self.current is not None:
            self.current[1] += data


class PublicBookingLink(unittest.TestCase):
    def check_booking(self, html):
        page = PublicPage()
        page.feed(html)
        self.assertEqual([link for link in page.links if 'cal.com/' in link[0]], [[PUBLIC_EVENT, LABEL]])
        self.assertIn(TERMS, ' '.join(page.text))
        self.assertTrue(any(link[0].startswith('mailto:architect@kapukai.org') for link in page.links))

    def test_served_routes_offer_only_the_public_intro(self):
        for path in ('visit-lab/index.html', 'community/contact/index.html'):
            with self.subTest(path=path):
                self.check_booking((COMMUNITY / 'public' / path).read_text())

    def test_contact_rebuild_preserves_public_booking_and_scoped_rate(self):
        class CapturedContact(Exception):
            pass

        def capture(path, _title, _description, content, *_args):
            if path == 'community/contact':
                self.check_booking(content)
                raise CapturedContact()

        with self.assertRaises(CapturedContact):
            build_workshop(capture)


if __name__ == '__main__':
    unittest.main()
