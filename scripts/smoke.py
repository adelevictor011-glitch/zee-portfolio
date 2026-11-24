#!/usr/bin/env python3
"""Smoke test for the live site. Run by .github/workflows/smoke.yml after every production
deploy and once a day. Prints one line per check and exits 1 if any check fails; the
workflow then opens (or updates) a GitHub issue labelled smoke-alert, which emails you."""
import json, re, sys, urllib.request, urllib.error

UA = {"User-Agent": "smoke-test (+github actions)"}
results = []

def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # DNS, TLS, timeout
        return 0, str(e)

def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))

def finish():
    bad = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(("PASS " if ok else "FAIL ") + name + (f" ({detail})" if detail else ""))
    with open("smoke-report.md", "w") as f:
        f.write("| Check | Result | Detail |\n|---|---|---|\n")
        for name, ok, detail in results:
            f.write(f"| {name} | {'✅' if ok else '❌'} | {detail.replace('|', '/')} |\n")
    sys.exit(1 if bad else 0)

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://gotozee.vercel.app").rstrip("/")

s, html = get(BASE + "/")
check("Homepage loads", s == 200, f"HTTP {s}")
size = len(html.encode())
check("Homepage is light (< 400 KB)", 0 < size < 400_000, f"{size:,} bytes")
check("No inline photos (images live in /img)", not re.search(r"data:image/(?!svg)", html))
for pat in ("ghp_", "github_pat_", "sk-ant-", "xkeysib-", "gsk_"):
    check(f"No secret in page ({pat})", pat not in html)
imgs = sorted(set(re.findall(r'"(/img/[a-z0-9-]+\.(?:webp|jpg|png))"', html)))
check("Image files referenced", bool(imgs), f"{len(imgs)} files")
for p in imgs[:8]:
    s2, _ = get(BASE + p); check(f"Image {p}", s2 == 200, f"HTTP {s2}")
m = re.search(r'<meta property="og:image" content="([^"]+)"', html)
check("WhatsApp preview image set", bool(m))
if m:
    s3, _ = get(m.group(1)); check("WhatsApp preview image loads", s3 == 200, f"HTTP {s3}")
for app in sorted(set(re.findall(r'https://(?:[a-z0-9-]+\.vercel\.app|nurjai\.com|www\.imagendai\.com)/', html))):
    if "gotozee" in app: continue
    s4, _ = get(app); check(f"App link {app}", s4 == 200, f"HTTP {s4}")
s5, h = get(BASE + "/api/health")
try:
    hj = json.loads(h)
except Exception:
    hj = {}
check("API health endpoint", s5 == 200 and hj.get("app") == "portfolio", f"HTTP {s5}")
for k, v in (hj.get("checks") or {}).items():
    check(f"Setting: {k}", v, "" if v else "add BREVO_API_KEY and ALERT_FROM_EMAIL in Vercel (gotozee) to get lead-triage emails")
finish()
