#!/usr/bin/env python3
"""Read-only Kapukai cross-publisher entry point health check."""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

REGISTRY = Path(__file__).with_name('entry-routes.json')


def inspect(routes, opener=urllib.request.urlopen):
    failures = []
    for route in routes:
        url = route['url']
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Kapukai-Entry-Route-Check/1.0'})
            with opener(request, timeout=12) as response:
                status = response.status
                destination = response.geturl()
                content_type = response.headers.get_content_type()
                response.read(1)
            if status != 200 or destination.rstrip('/') != url.rstrip('/') or content_type != 'text/html':
                failures.append(f"{route['id']}: unexpected status, destination or MIME ({status}, {destination}, {content_type})")
            else:
                print(f"PASS {route['id']} {url}")
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            failures.append(f"{route['id']}: {type(exc).__name__} ({url})")
    return failures


def main():
    routes = json.loads(REGISTRY.read_text())['routes']
    errors = inspect(routes)
    for error in errors:
        print('FAIL ' + error, file=sys.stderr)
    return bool(errors)


if __name__ == '__main__':
    sys.exit(main())
