# Audit: MonetizeMore Traffic Cop — what it collects

Date: 2026-10-28

## Scope and its limits

- **Traffic Cop is closed source.** No public GitHub repository exists (searched
  GitHub for "monetizemore traffic cop"; zero repos). The detection logic runs in
  a per-account, obfuscated script served from `c.pubguru.net` and on
  MonetizeMore's servers. Nobody outside MonetizeMore can audit that from source.
- **The script itself was not retrievable** from this audit environment
  (`c.pubguru.net` and `monetizemore.com` are blocked by the sandbox network
  policy). So claims about what the browser script collects come from the
  vendor's own published statements, not from reading its code.
- **What was audited from real code:** the only open-source integration found,
  the MonetizeMore/PubGuru "One Click" module of the Advanced Ads WordPress
  plugin (`WordpressPluginDirectory/advanced-ads`,
  `advanced-ads/modules/one-click/`). It shows how Traffic Cop is configured and
  injected, not how it fingerprints.

## 1. What the vendor says it collects (from its own published statements, not verified)

| Data | Source |
|---|---|
| IP address (IPv4/IPv6) | Privacy policy; Traffic Cop API page |
| User agent, request timestamps | Traffic Cop API page ("scores then discards") |
| Browser and device information | Privacy policy |
| Geo-location, incl. precise / GPS where available | Privacy policy |
| Cookie-based MonetizeMore UserIDs, mobile device IDs | Privacy policy |
| Partner-provided "people identifiers", pixel-based user matching | Privacy policy |

The API page and the general privacy policy don't match. "Minimal metadata, then
discarded" applies to the **server-side API** only. The **browser script** falls
under the general policy, which allows cookie IDs, device IDs, precise location
and user matching with partners. Any IVT/bot detector working in the browser has to
collect behavioural and environment signals (mouse/touch events, timing,
headless/automation flags, screen/hardware properties). That is fingerprinting
in function, whatever it's called. **No source confirms or rules out a specific
fingerprinting technique.** Only capturing the script's network traffic would
settle it (see section 4).

## 2. What the integration code shows

- **Domain is sent to MonetizeMore:** `GET https://app.pubguru.com/domain_configs/?domain=<site>`
  (`admin/class-ajax.php:227-235`). The returned JSON config is stored in WP options.
- **Traffic Cop is server-controlled:** it is active only if the remote config says
  `trafficCopIvtAction == 'block'` and `trafficCopTestPercent > 0.01`
  (`class-helpers.php:29-41`). MonetizeMore can switch it on or off, or limit it to
  a percentage of visitors, without the site owner changing code.
- **It gates Google ads:** every `googletag.display` call gets wrapped in
  `pg.atq.push(function(){...})` (`modules/class-traffic-cop.php:38-48`), so ads
  render only after the Traffic Cop script decides the visitor is valid. To do
  that, the script has to run on **every page view for every visitor**, before
  any ad renders.
- **Remote script on every page:** `<script src="//c.pubguru.net/<config name>" async>`
  is injected into `<head>` along with Google's `gpt.js`
  (`modules/class-header-bidding.php:84-92`). Whatever that script collects, the
  site owner never sees its code.

## 3. Security defects in the integration (real, verifiable in code)

1. **TLS verification disabled:** `'sslverify' => false` on the config fetch
   (`admin/class-ajax.php:233`). Anyone positioned between the WordPress server
   and `app.pubguru.com` can serve a forged config.
2. **Unescaped remote value written into HTML:** `$config['name']` from that API
   response is placed raw into a `<script src>` attribute with `sprintf`
   (`class-helpers.php:70`, `class-header-bidding.php:88`). Combined with #1, a forged
   `name` such as `x"></script><script>…` becomes **stored XSS on every front-end
   page**. Fix: keep TLS verification on, and validate `name` against
   `^pg\.[a-z0-9._-]+\.js$` (plus `esc_url`).
3. **Unvalidated `testDomain` POST parameter** goes straight into the query string
   (`admin/class-ajax.php:228-232`), not URL-encoded. It's limited to admins with
   a nonce, so low impact, but it's sloppy.

## 4. How to get a real answer on collection

Reading policies isn't an audit. To find out what the script sends:

1. Load a page with Traffic Cop live in Chromium with Playwright, recording a HAR
   file (`recordHar`).
2. List every request to `*.pubguru.net`, `*.monetizemore.com`, `m2d.m2.ai`;
   decode the payloads (often base64/JSON in POST bodies or beacons).
3. Hook `navigator`, `screen`, `CanvasRenderingContext2D.toDataURL`,
   `WebGLRenderingContext.getParameter`, `AudioContext`, and
   `addEventListener('mousemove'|'touchstart')` to log what the script reads.
4. Diff the results with and without consent (CMP accepted vs rejected) to see
   whether it honours TCF/GPP signals.

This needs network access to `c.pubguru.net` and a site that actually runs
Traffic Cop.

## Sources

- Advanced Ads plugin source: https://github.com/WordpressPluginDirectory/advanced-ads
- Traffic Cop API: https://www.monetizemore.com/blog/traffic-cop-api/
- MonetizeMore Privacy Policy: https://www.monetizemore.com/privacy-policy/
- Traffic Cop Terms: https://www.monetizemore.com/traffic-cop-standard-terms-conditions/
- Install guide: https://www.monetizemore.com/traffic-cop-tutorial-how-to-measure-invalid-traffic-when-running-google-ad-manager-or-pubguru-header-bidding-ad-exchange-or-adsense-hardcoded-tags/
