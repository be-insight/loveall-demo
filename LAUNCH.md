# Launch checklist: moving Loveall to loveallplumbing.com

Until launch, the site lives only at the private preview **https://loveall-demo.pages.dev**.
It is `noindex` on every page (meta tag plus `public/_headers`), and lead emails go to
**leads@beinsight.co only**.

Do **not** start any of this until all three are true:

- [ ] Tim has signed off on the site.
- [ ] Tim's plumbing license number is confirmed.
- [ ] The effective date for the Privacy Policy, Terms and Accessibility statement is set.

Don't touch loveallplumbing.com or its DNS until then.

---

## 1. Before the move (no changes to Tim's domain yet)

1. Find out where loveallplumbing.com is registered and who has the login (Tim, or whoever set it up).
2. Write down every DNS record it has today, **especially email** (MX, SPF/TXT, DKIM, autodiscover).
   If Tim gets email at that domain, those records must come across unchanged.
3. If DNSSEC is on at the registrar, plan to turn it off just before the nameserver change
   (turn it back on through Cloudflare afterwards).
4. Optional: lower the TTL on the current records to 300 seconds a day ahead, so the switch is quick.

## 2. Fill the last blanks and flip to "index"

The only blanks left in `public/` are `LICENSE_LINE` and `EFFECTIVE_DATE`.

1. Copy `scripts/tokens.example.json` to `scripts/tokens.json` (git-ignored) and set at least:
   ```json
   {
     "LICENSE_LINE": "City of Kansas City, MO plumbing contractor license #<real number>",
     "EFFECTIVE_DATE": "<Month D, YYYY>"
   }
   ```
2. Run:
   ```bash
   python scripts/fill-tokens.py scripts/tokens.json --launch
   ```
   With `--launch` and no blanks left, this removes the draft bars and "Draft" chips and changes
   every page's robots tag to `index, follow`. Check the output says `still blank: none` for all four pages.
3. Point canonical and `og:url` at the real domain in all four pages. They still say
   `https://insight-demo.github.io/loveall-demo/...`; change them to
   `https://loveallplumbing.com/` (and `/privacy.html`, `/terms.html`, `/accessibility.html`).
   Also delete the "Launch checklist" HTML comment at the top of `index.html`.
4. Delete `public/_headers` (it sends `X-Robots-Tag: noindex` on every response).
5. Resolve the chat-AI mismatch: the live chat on Cloudflare is the scripted assistant, but the
   Privacy Policy says replies come from Anthropic. Either add a Claude-backed `/api/chat`
   endpoint or reword that section before going public.

## 3. Send leads to Tim

In `wrangler.toml`, change one line:

```toml
LEAD_TO = "tloveall10@gmail.com"
```

`LEAD_BCC = "leads@beinsight.co"` stays, so Insight keeps a copy of every lead (the BCC is skipped
automatically only while `LEAD_TO` is the same address). Update the header comment in `wrangler.toml` too.

Commit steps 2 and 3 together and push to `main`. Cloudflare Pages deploys automatically.
Send one test lead and confirm it reaches Tim **and** the BCC (tell Tim first, since it goes to his inbox).

## 4. Move loveallplumbing.com onto Insight's Cloudflare account

1. Cloudflare dashboard (admin@beinsight.co account) → **Add a domain** → `loveallplumbing.com` → Free plan.
2. Review the records Cloudflare imported against the list from step 1. Make sure every email record
   is there and set to **DNS only** (grey cloud). Remove old website A/CNAME records for `@` and `www`
   only if they would conflict with Pages.
3. Cloudflare shows two nameservers. At Tim's registrar, replace the nameservers with those two
   (turn DNSSEC off there first if it was on).
4. Wait until the zone shows **Active** in Cloudflare (minutes to a few hours).

## 5. Attach the domain to the Pages project

1. Workers & Pages → `loveall-demo` → **Custom domains** → add `loveallplumbing.com`, then `www.loveallplumbing.com`.
   Cloudflare creates the DNS records and the SSL certificate.
2. Redirect `www` to the apex: Rules → Redirect Rules → "Redirect from WWW to root" template (301).
3. Optional: redirect `loveall-demo.pages.dev` to the real domain so the preview URL stops serving
   a second copy (small check in a Pages middleware on the `Host` header).

## 6. Check it's live

- [ ] `https://loveallplumbing.com` and `https://www.loveallplumbing.com` load over HTTPS (www redirects).
- [ ] View source: robots says `index, follow`, canonical is `loveallplumbing.com`, no draft bars.
- [ ] Response headers no longer include `X-Robots-Tag`.
- [ ] One quote-form lead and one chat lead reach tloveall10@gmail.com, with the BCC at leads@beinsight.co,
      and both rows appear in D1 `loveall-leads` with `email_status = 'sent'`.
- [ ] Tim's email at the domain (if any) still works.
- [ ] Turn DNSSEC back on (Cloudflare → DNS → Settings, then add the DS record at the registrar).
- [ ] Optional: add the site to Google Search Console.

## Already in place (nothing to do at launch)

- D1 database `loveall-leads`, bound to the Pages project as `DB`.
- Worker `loveall-lead-cleanup`: deletes leads older than 24 months, daily at 08:00 UTC.
- Resend sending from `leads@beinsight.co` (secret `RESEND_API_KEY` on the Pages project).
