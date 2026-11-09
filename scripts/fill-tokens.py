#!/usr/bin/env python3
"""Fill the launch blanks in the site.

The pages contain highlighted blanks like
  <span class="fill" data-fill="EMAIL" title="...">business email</span>
and, inside attributes, literal {{EMAIL}} placeholders.

Usage:
  python3 scripts/fill-tokens.py scripts/tokens.json

tokens.json maps token names to values (see tokens.example.json). Every token
present in the JSON is filled in index.html, privacy.html, terms.html and
accessibility.html; tokens missing from the JSON are left as blanks so the
pages keep showing what still needs confirming. The draft notice bars are
removed only when --launch is passed and no blanks remain.
"""
import json, re, sys, pathlib, html as htmlmod

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ["index.html", "privacy.html", "terms.html", "accessibility.html"]

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    values = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    launch = "--launch" in sys.argv
    span = re.compile(r'<(span|a)([^>]*?)\sclass="fill"\sdata-fill="([A-Z_]+)"[^>]*>(.*?)</\1>', re.S)
    for name in PAGES:
        p = ROOT / name
        html = p.read_text(encoding="utf-8")
        def sub(m):
            tag, attrs, token, label = m.groups()
            if token not in values:
                return m.group(0)
            val = htmlmod.escape(values[token], quote=False)
            if tag == "a":
                href = re.search(r'href="([^"]*)"', attrs)
                href = href.group(1) if href else ""
                return f'<a href="{href}">{val}</a>'
            return val
        html = span.sub(sub, html)
        for token, val in values.items():
            html = html.replace("{{" + token + "}}", htmlmod.escape(val, quote=True))
        remaining = sorted(set(span.findall(html)[i][2] for i in range(len(span.findall(html)))))
        if launch and not remaining:
            html = re.sub(r'<div class="draft" role="note">.*?</div>\s*</div>\s*', "", html, flags=re.S)
            html = html.replace('<span class="chip">Draft</span>', "")
            html = html.replace('<meta name="robots" content="noindex, nofollow">', '<meta name="robots" content="index, follow">')
        p.write_text(html, encoding="utf-8")
        print(f"{name}: filled; still blank: {', '.join(remaining) or 'none'}")

if __name__ == "__main__":
    main()
