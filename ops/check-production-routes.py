#!/usr/bin/env python3
"""Anonymous drift check between tracked pages, the community deployment and kapukai.org."""
import argparse
import concurrent.futures
import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
MONTH = re.compile(r"\d{4}-(?:0[1-9]|1[0-2])")
MAX_BYTES = 8 * 1024 * 1024


def published_routes(config, public):
    base = config["monthly_archive"]
    months = sorted(p.parent.name for p in (public / base.strip("/")).glob("*/index.html") if MONTH.fullmatch(p.parent.name))
    return [*config["managed"], *(base + month + "/" for month in months)]


def normalize(value):
    return " ".join(value.split())


class Signals(HTMLParser):
    def __init__(self, page_url, hosts):
        super().__init__()
        self.url = page_url
        self.hosts = hosts
        self.tags = []
        self.words = []
        self.assets = set()
        self.links = set()
        self.canonical = None
        self.h1 = 0
        self.main = 0
        self.ignored = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        # Rendered user-flow semantics. Do not compare transient CSP nonces, analytics or whitespace.
        if tag == "main":
            self.main += 1
        if tag == "h1":
            self.h1 += 1
        if tag == "script" and not a.get("src"):
            self.ignored = tag
            return
        if tag == "script" and (a.get("src","").startswith("/_vercel/") or a.get("src","").startswith("/.well-known/vercel/")):
            return
        if tag == "link" and "canonical" in a.get("rel","").split():
            self.canonical = a.get("href","")
        if tag == "a":
            self.links.add(urlsplit(urljoin(self.url,a.get("href",""))).path)
        asset = None
        if tag in ("script","img","source","video"): asset=a.get("src")
        if tag == "link" and set(a.get("rel","").split()) & {"stylesheet","icon","apple-touch-icon","manifest","preload"}: asset=a.get("href")
        if tag == "meta" and a.get("property",a.get("name","")) in {"og:image","og:image:url","og:image:secure_url","twitter:image"}: asset=a.get("content")
        if asset:
            url = urlsplit(urljoin(self.url,asset))
            if url.scheme=="https" and url.hostname in self.hosts:
                self.assets.add(url.path + (("?"+url.query) if url.query else ""))
        if tag in ("a","img","link","label","input","select","option","form","button","meta","h1","h2","h3","p","style","script","main","title","span","fieldset","legend","summary","details"):
            keys=("href","src","rel","action","method","name","type","id","class","for","value","role","property","content","alt","required","selected","checked","data-source","aria-label","aria-hidden")
            self.tags.append((tag, tuple((k,normalize(a.get(k) or "")) for k in keys if k in a)))

    def handle_endtag(self,tag):
        if tag == self.ignored: self.ignored=None

    def handle_data(self,data):
        if not self.ignored and normalize(data): self.words.append(normalize(data))

    def signature(self):
        return self.tags,normalize(" ".join(self.words))


def same_destination(candidate, expected):
    p, target=urlsplit(candidate), urlsplit(expected)
    return p.scheme=="https" and p.netloc==target.netloc and p.path.rstrip("/")==target.path.rstrip("/") and p.query==target.query and not p.username


def fetch(url, expected, html):
    # A redirect to a homepage, login page, or preview host must fail even when it returns 200.
    target=urlsplit(expected)
    class Redirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            if not same_destination(newurl,expected): raise ValueError("unexpected redirect: "+newurl.split("?")[0])
            return super().redirect_request(req,fp,code,msg,headers,newurl)
    req=Request(url,headers={"User-Agent":"Kapukai-Public-Route-Check/1.0","Cache-Control":"no-cache"})
    with build_opener(Redirect()).open(req,timeout=10) as r:
        if r.status!=200 or not same_destination(r.geturl(),expected): raise ValueError("unexpected response URL or status")
        ct=r.headers.get_content_type()
        if html != (ct=="text/html"): raise ValueError("unexpected MIME type "+ct)
        body=r.read(MAX_BYTES+1)
        if not body or len(body)>MAX_BYTES: raise ValueError("empty or oversized response")
        if not html:
            ext=Path(target.path).suffix.lower()
            expected_mime={".css":{"text/css"},".js":{"application/javascript","text/javascript"},".svg":{"image/svg+xml"},".png":{"image/png"},".jpg":{"image/jpeg"},".jpeg":{"image/jpeg"}}
            if ext in expected_mime and ct not in expected_mime[ext]: raise ValueError("wrong asset MIME: "+ct)
        return body


def view_only(config, get):
    errors=[]
    for path in config.get("observe_only",[]):
        ref=None
        for host in (config["reference"],config["branded"]):
            url=host+path
            try:
                b=get(url,url,True)
                p=Signals(url,set());p.feed(b.decode("utf-8"));p.close()
                if p.h1<1: raise ValueError("missing document heading")
                if ref is not None and p.signature()!=ref: raise ValueError("monitor-only page differs from reference")
                ref=p.signature()
            except Exception as e: errors.append(f"{url}: {e} (monitor only)")
    return errors


def run(config, public, get=fetch):
    hosts={urlsplit(config[k]).hostname for k in ("branded","reference")}
    routes=published_routes(config,public)
    errors=[]; assets=set(); work=[]
    def parse(b,url):
        p=Signals(url,hosts);p.feed(b.decode("utf-8"));p.close();return p
    for path in routes:
        src=parse((public/path.strip("/")/"index.html").read_bytes(), config["branded"]+path)
        if src.canonical!=config["branded"]+path or src.h1!=1 or src.main!=1: errors.append("source page structure/canonical: "+path)
        if path==config["monthly_archive"]:
            for child in routes:
                if child.startswith(path) and child!=path and child not in src.links: errors.append("archive index missing issue "+child)
        assets.update(src.assets)
        for host in (config["reference"],config["branded"]):
            work.append(("page",host+path,src))
    known={}
    hosted={}
    for path in sorted(assets):
        local=(public/urlsplit(path).path.lstrip("/")).resolve()
        if public.resolve() not in local.parents or not local.is_file():
            errors.append("missing tracked asset: "+path);continue
        known[path]=hashlib.sha256(local.read_bytes()).hexdigest()

    def normalize_namespace(got):
        # The branded installer can preserve shared assets by pinning ONLY these
        # two files. Verify both the hash in each URL and the fetched file bytes.
        replacements={}
        for asset in got.assets:
            if not asset.startswith("/newsletter/_community-assets/"): continue
            m=re.fullmatch(r"/newsletter/_community-assets/([0-9a-f]{64})/(style[.]css|app[.]js)",asset)
            if not m: raise ValueError("unrecognized asset alias")
            source="/assets/community/"+m[2]
            if known.get(source)!=m[1]:raise ValueError("incorrect release digest for "+source)
            replacements[asset]=source
        got.tags=[(tag,tuple((k,replacements.get(v,v) if k in {"src","href"} else v) for k,v in attrs)) for tag,attrs in got.tags]
        return replacements

    def check(job):
        kind,url,src=job
        try:
            b=get(url,url,kind=="page")
            if kind=="asset":
                if hashlib.sha256(b).hexdigest()!=src: raise ValueError("asset bytes differ from release")
            else:
                got=parse(b,url)
                remap=normalize_namespace(got) if url.startswith(config["branded"]+"/") else {}
                for observed in got.assets:
                    source=remap.get(observed,observed)
                    if source in known:
                        hosted[config["branded" if url.startswith(config["branded"]+"/") else "reference"]+observed]=known[source]
                if (got.main,got.h1,got.canonical)!=(src.main,src.h1,src.canonical) or got.signature()!=src.signature():
                    raise ValueError("page content, controls, CTA or canonical differs from release")
        except Exception as e: return f"{url}: {e}"
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        errors.extend(x for x in pool.map(check,work) if x)
        errors.extend(x for x in pool.map(check,[("asset",u,h) for u,h in hosted.items()]) if x)
    errors.extend(view_only(config,get))
    print(f"Checked {len(routes)} pages and {len(assets)} referenced asset paths on {len(hosts)} hosts.")
    return errors


def inventory(config, public, manifest):
    # Existence in this code tree is evidence of a candidate, not proof of DNS ownership.
    tracked={"/"+p.relative_to(public).as_posix()[:-len("index.html")] for p in public.rglob("index.html")}
    declared={"/"+p[:-len("index.html")] for p in manifest.get("files",{}) if p.endswith("/index.html")}
    managed=set(published_routes(config,public)); observe=set(config.get("observe_only",[]))
    other=set(config.get("outside_this_mirror",{}))
    result={"monitored community": sorted(managed), "monitor only": sorted(observe),
            "separate publisher": sorted(other),"release manifest entries outside checks": sorted(declared-managed-observe-other),
            "static index files outside manifest and checks": sorted(tracked-declared-managed-observe-other)}
    return result


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory",action="store_true",help="Print tracked and uncovered route inventory; do not fetch URLs.")
    args=parser.parse_args()
    config=json.loads((ROOT/"ops/production-routes.json").read_text())
    if args.inventory:
        print(json.dumps(inventory(config, ROOT/"community/public", json.loads((ROOT/"community/release-manifest.json").read_text())),indent=2))
        sys.exit(0)
    errors=run(config,ROOT/"community/public")
    for error in errors: print("FAIL "+error,file=sys.stderr)
    sys.exit(bool(errors))
