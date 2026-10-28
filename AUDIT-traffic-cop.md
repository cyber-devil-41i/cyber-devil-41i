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

---

# Part 2: Signals Traffic Cop collects, and how it scores them (evidence-based)

## Evidence source

DuckDuckGo **Tracker Radar** (`duckduckgo/tracker-radar`, `domains/US/pubguru.net.json`).
Its crawler loads real sites in an instrumented browser and logs every browser
API a third-party script calls and every cookie it sets. This is observed
runtime behaviour, not vendor marketing. Limits: a crawler bot is the visitor,
the samples are small (5 sites for the main TC bundle), and it records *which*
APIs are read, not the values or the request bodies.

Tracker Radar gives the Traffic Cop bundles (`/tc/trafficcop-async-min-main.js`,
`/v/tc-260303-*.js`, `/v/pg-*.js`) a **fingerprinting score of 3, the maximum**.

## 1. Signals read in the browser (observed API calls)

| Category | APIs observed |
|---|---|
| Browser identity | `userAgent`, `appName`, `appCodeName`, `product`, `productSub`, `vendor`, `platform`, `userAgentData.brands/platform`, **`getHighEntropyValues`** (full OS/CPU/model) |
| Automation / headless flags | **`navigator.webdriver`**, `plugins`, `mimeTypes` (empty in headless), `Performance.memory` (Chrome-only), `doNotTrack` |
| Hardware | `hardwareConcurrency`, `deviceMemory`, `maxTouchPoints`, `mediaDevices`, `connection` (network type / RTT) |
| GPU (WebGL fingerprint) | `WebGL getParameter` (renderer/vendor), `getExtension`, `getSupportedExtensions`, `getContextAttributes`, WebGL2 `getParameter` |
| Screen / window geometry | `screen.width/height/availWidth/availHeight/colorDepth/pixelDepth`, `devicePixelRatio`, `inner/outerWidth/Height`, `screenLeft/Top` |
| Locale / time | `language`, `languages`, `getTimezoneOffset`, `Intl.DateTimeFormat().resolvedOptions` (IANA timezone) |
| Timing | `Date.getTime`, `performance.timing.navigationStart` |
| Storage | `cookie` (read/write), `localStorage`, `sessionStorage`, `indexedDB` |

What these are for (inference, standard IVT practice): consistency checks.
Does the UA say Windows/Chrome while WebGL reports a SwiftShader/llvmpipe GPU
(headless)? Is `webdriver` true? Are plugins/mimeTypes empty? Does the
timezone match the IP geolocation? Is the outer window the same size as the inner
one (no browser chrome)? Are memory or touch values impossible for the claimed device?

## 2. Cookies set, which show the scoring pipeline

Cookies set on the publisher's domain (first-party) by the Traffic Cop script:

| Cookie | Lifetime | What the name and size indicate |
|---|---|---|
| `pg_tc` | 1 day | verdict / status (10 chars) |
| `pg_bot_model` | 1 day | which bot-detection model scored you |
| `pg_bot_percent` | 1 day | bot probability / score bucket |
| `pg_bot_reason` | **10 days** | 13-char reason code for the flag |
| `pg_quick_check` | 1 day | result of a fast client-side pre-check |
| `pg_tc_device` | 1 day | device class |
| `pg_ua` | **10 days** | **full user-agent string** stored (119 chars) |
| `pg_inner_width` | 1 day | viewport width |
| `pg_latency_before_tc`, `pg_tc_response_time`, `pg_pv_time_1` | 1 day | timing signals (page-load to TC, API round trip, page-view timing) |
| `pg_session_id` | 1 h | per-session UUID |
| `pg_mm2_cookie_a` | **1 year** | **persistent visitor UUID** |
| `pg_analytics`, `pg_lazy`, `pg_pl`, `pg_beacon` (30 d) | – | feature / beacon flags |

Set by the wider PubGuru ad stack that ships alongside Traffic Cop (`/v/pg-*.js`):
`pg_ip` (**visitor IP in a cookie, 30 days**), `pg_geo` (51-char geolocation),
`pg_utm_*` (campaign source), `pg_session_depth`, `pg_canonical_session`,
`pg_unq_cohort_key`, `pg_last_pageview_data`. The stack also sets Prebid
**cross-site IDs**: `_sharedID` (180 d), `pbjs-unifiedid` (60 d), and Criteo
`cto_bundle`/`cto_bidid` (390 d).

## 3. Scoring flow (reconstructed; the model itself is server-side and not visible)

1. A page loads `c.pubguru.net/pg.<site>.js`, which loads the TC bundle.
2. The bundle collects the signals in section 1 and runs a **client-side quick check**
   (`pg_quick_check`).
3. It sends signals plus IP and UA to **`pubguru.net/tc` (XHR)**. Tracker Radar
   observed this endpoint on 15 sites, along with `/stream` and the root (XHR/Ping beacons).
4. The server returns a verdict, which is cached in cookies: `pg_tc`, `pg_bot_model`,
   `pg_bot_percent`, `pg_bot_reason`. Repeat page views use the cache instead
   of re-scoring every time.
5. In block mode the `pg.atq` queue never runs, so no ads are requested
   for flagged visitors. In measure mode the verdict is only reported.

The weights, thresholds and model are server-side. **Nobody outside
MonetizeMore can see the scoring logic**, and anyone who claims otherwise is guessing.

## 4. Consent problem found on a real site

A saved copy of rapidtables.com's `tagmng8.js` (in GitHub repo
`siddhantm27/websec-help`) loads `c.pubguru.net/pg.rapidtables.com.js` from
`setAds()`. `setAds()` runs on the CMP script's `onload` **whether or not the
visitor consented**: Google Consent Mode gates only gtag, not Traffic Cop.
On that snapshot (date unknown), the fingerprinting and the cookies above run
before any consent choice. IVT detection can arguably rely on
"legitimate interest" under GDPR, but a 1-year visitor UUID and a 30-day IP cookie go
well beyond fraud detection.

---

# Part 3: Which sellers.json publishers actually run MonetizeMore tags

## Inputs
- **Google sellers.json** (`storage.googleapis.com/adx-rtb-dictionaries/sellers.json`,
  952,560 sellers): MonetizeMore = `pub-5278973888786334` ("eSell Solutions Ltd. DBA
  MonetizeMore", BOTH) and `pub-6190096338979886` (eSell Solutions Ltd., BOTH).
- **MonetizeMore sellers.json**: 112 entries pasted by the user (partial file).
- **Tag evidence**: Tracker Radar `exampleSites` that loaded `pubguru.net` scripts.
- Live crawling was **not possible**: this sandbox blocks every publisher site.

## Confirmed: in MonetizeMore's sellers.json AND observed loading PubGuru/TC tags

| Domain | Observed script | Own Google account (Google sellers.json) |
|---|---|---|
| hamariweb.com | `pg.hamariweb.js`, `/tc` | ABRAR AHMED (pub-0231167329385289) |
| wvnews.com | `pg.wvnews.js`, `pg-260910…`, TC bundle | Clarksburg Publishing Co |
| marineweather.net | TC bundle | Keith Neil Smith |
| statisticsbyjim.com | TC bundle | not listed (confidential) |
| automateexcel.com | TC bundle | not listed |
| cartermatt.com | `/tc` | not listed |
| dailyhealthpost.com | `/tc` | not listed |
| will-mixen.de | `/tc` | not listed |
| visioncenter.org | pubguru.net | not listed |
| auditorioibirapuera.com.br | pubguru.net | Patrick Silveira Teixeira |

Observed running PubGuru/TC but **not** in the pasted part of the file (they may be in the
part that was cut off, or use Traffic Cop standalone): rapidtables.com (TC in front of
**Snigel** ads, so a standalone TC customer), dmv.com, pissedconsumer.com,
recentlybooked.com, audiogon.com, learning-mind.com, newmouth.com, aboutssdi.com,
allaboutvehicles.com, appointmenthelp.org, edriverslicenses.com, savingsgrove.com,
easymediterraneanrecipes.blog.

The other ~100 sellers.json domains: **not observed, which proves nothing either way**
(Tracker Radar crawls a limited top-site list). 36 of the 112 have their own
Google account in Google's file; the rest are confidential or absent.

## Defects in MonetizeMore's sellers.json
- `investify.pk` listed twice (`6514199462`, `8875fb46d7`).
- Not real publisher domains: `blogspot.com` (a shared platform, so the line is meaningless),
  `com.com`, `test-setup.com`, `starxnetwork.netlify.app`.
- `http://guardian.co.tt`: a URL where the spec requires a bare domain.
- `pubguru.com` ("MonetizeMore") listed as `PUBLISHER`: an intermediary
  labelling its own inventory as publisher-direct.
- Name and domain don't match: clickfinancas.com → albertsabin.com, sassacheck.co.za →
  maryberryrecipe.co.uk, seomagnifier.com → seotoolscentre.com, levelsanswers.com →
  gamesforcats.com.
- randomwordgenerator.com: MM says "Andrea de Donatis", Google says "Jeffrey Strain".

## Why ads.txt can't answer "who uses MonetizeMore"
124 public ads.txt files on GitHub contain MonetizeMore's Google ID.
106 list it as `RESELLER`, copied inside 1,000–5,900-line bundles from Ezoic,
Setupad, PubFuture, Playwire and others. Of the 18 `DIRECT` lines, 11 come from
**one identical 1,184-line template** ("Arcane Technologies") copied across
unrelated repos. An ads.txt line shows that someone pasted text,
not that a MonetizeMore tag runs on the site.

---

# Part 4: Blockthrough (adblock ad-recovery) — sellers.json + what it collects

## Sources
- Blockthrough sellers.json, pasted by the user (~130 sellers, cut off at the end).
- Google sellers.json: `pub-3792796726804880` "Blockthrough Inc.", `seller_type: BOTH`.
- DuckDuckGo Tracker Radar `domains/US/btloader.com.json` (owner: Blockthrough Inc.,
  **3,798 sites**, fingerprinting score 2 of 3).
- Blockthrough's own open-source Prebid bidder, `prebid/Prebid.js` `modules/blockthroughBidAdapter.js`
  (analysed with REA 6.8.0 plus a manual read).
- Crawled loader snippets (`CBA-UPC/clean_resources`, `Nun0Alv3s/JS_DATASET`,
  `rayngan999/Obfuscation-Automation`). These are loader tags only; no copy of the btloader runtime was found.
- `btloader.com` itself is blocked in this sandbox, so the runtime script was **not** decompiled.

## The tag carries the seller ID
`https://btloader.com/tag?o=<id>&upapi=true` — the `o=` parameter is the **sellers.json
seller_id**. From the crawled snippets:

| `o=` | Seller (Blockthrough sellers.json) |
|---|---|
| 5150306120761344 | Playwire LLC (INTERMEDIARY) |
| 5184339635601408 | Azerion Technology B.V / pubgalaxy.com (PUBLISHER) |
| 5098683085881344 | Slashdot Media, LLC (PUBLISHER) |
| 5071905434894336, 5659168086163456, 5075500865683456 | not in the pasted part of the file |

So any page's source maps straight to the Blockthrough account that gets paid. One
snippet (`web_38489.js`) loads Blockthrough **only `if (window.isBlocked)`**, so the
publisher runs its own adblock detection and calls Blockthrough only for blocked users.

## Publishers observed running btloader (Tracker Radar) vs sellers.json
Exact domain matches: **9gag.com, msn.com**. The file lists *corporate* domains, so
exact matching misses most sites. Matches by ownership: people.com, verywellhealth.com,
liveabout.com → **People Inc.**; tvguide.com → **Fandom**. Other observed sites (likely sold
through intermediaries such as Playwire, Freestar, CafeMedia, Venatus): 9to5mac, drudgereport,
knowyourmeme, myanimelist, screenrant, collider, makeuseof, tutorialspoint, polygon,
popsugar, sueddeutsche.de, wordreference, icy-veins, emojipedia and 100+ more.

## What Blockthrough collects (observed in the browser, Tracker Radar)
`btloader.com/tag` (2,409 sites):
- `userAgent`, `platform`, **`getHighEntropyValues`** (full UA Client Hints: OS version, model, architecture)
- `screen.width/height`, `devicePixelRatio`, `innerWidth/Height`
- **`navigator.webkitTemporaryStorage`**: storage-quota check, a known **incognito / private-mode detector**
- `performance.memory` (Chrome-only, also used to spot automation), `connection`
- `localStorage`, `sessionStorage`

Endpoints called (each one says what it is for):
| Endpoint | Sites | Purpose (from name / type) |
|---|---|---|
| `/cchecker.html` (iframe, sets/reads cookies) | 2,153 | third-party cookie-support test |
| `/trustedIframe.html` | 2,136 | sandboxed frame used to render "acceptable ads" |
| `/device` | 2,133 | device classification |
| `/exd` | 1,606 | extension / adblocker detection result |
| `/country` | 751 | geo lookup (IP) |
| `/pv` | 707 | page-view beacon |
| `/websiteconfig` | 462 | per-site config |
| `/log`, `/evts` | 35 | event telemetry |

**The "block" decision** is adblock detection, not human-vs-bot: detect the blocker → check
whether the user's list allows Acceptable Ads (Blockthrough belongs to eyeo, which runs
Adblock Plus) → serve recovered ads through the trusted iframe. Its sellers.json even
contains **"Eyeo Test Organization" — `ad-test.networkfiltering.eyeo-staging.it`**.

## What the Prebid bidder sends (real source code)
- POSTs a full **OpenRTB 2.5** request to `https://pbs.btloader.com/openrtb2/auction`
  (Blockthrough's own Prebid Server). That includes everything Prebid's `ortbConverter`
  fills in: `site` (page URL, referrer, domain), `device` (UA, screen, language), `user`
  (**eids**: SharedID / UnifiedID etc. if the publisher has ID modules), `regs` (GDPR/USP/GPP).
- `imp.ext` = the raw publisher params plus `gpid`.
- **User-sync iframe** `cdn.btloader.com/user_sync.html?bidders=<every bidder that answered>`
  with `gdpr_consent`, `gpp` and `us_privacy`. This is cookie-matching for **every downstream bidder**.
- Test switch: adding **`?btServerTest=true`** to a page URL sets `request.test = 1`.
- IAB GVL vendor ID **815**, so Blockthrough relies on TCF consent in the EU.

## Defects in Blockthrough's sellers.json
1. **Staging/test seller in production**: "Eyeo Test Organization", `ad-test.networkfiltering.eyeo-staging.it`.
2. **Two ID formats**: 16-digit IDs plus 8-hex IDs (`f65cfbd4`, `d137d16e`, …) for the German
   block, which looks like a merged acquired file (the Yieldlove/IQ Digital publishers).
3. `pub-3792796726804880` is listed in Blockthrough's own file as `INTERMEDIARY`, but
   Google lists the same account as `BOTH`: the two files disagree.
4. One domain, **`iqdigital.de`**, covers four different legal entities (ZEIT, FAZ,
   Handelsblatt, IQ Digital): the sales house's domain instead of each publisher's.
5. Typos: "Nextstar" (Nexstar), "Mediahius" (Mediahuis); mixed-case domains (`Crazygames.com`,
   `NYPost.com`, `9Gag.com`).
6. Corporate domains instead of the sites that are sold (`people.inc`, `pmc.com`,
   `yahooinc.com`, `wbd.com`), so buyers can't verify supply against `site.domain`.

---

# Part 5: How Blockthrough's technology works (reconstructed)

Evidence labels: **[O]** observed (Tracker Radar crawl / real code / filter lists),
**[P]** public industry fact, **[I]** inference from endpoint names and behaviour.
The `btloader.com/tag` runtime itself could not be downloaded, so the internal
detection code is **not** verified line by line.

## Pipeline

```
 page loads ──► btloader.com/tag?o=<sellerId>|h=<host-key>&upapi=true      [O]
      │          reads UA, Client Hints, screen, DPR, storage quota,        [O]
      │          performance.memory, localStorage/sessionStorage
      ▼
 1. CONFIG      GET /websiteconfig   per-site rules, which units to recover  [O][I]
 2. ENVIRONMENT GET /device, /country  device class + IP geo                [O][I]
                iframe /cchecker.html  can 3rd-party cookies be set?        [O]
 3. DETECT      bait requests / bait elements checked → result to /exd       [I]
                ("extension detection": which blocker, if any)
                webkitTemporaryStorage quota → incognito flag               [O][I]
 4. DECIDE      no blocker        → do nothing (normal ad stack runs)       [I]
                blocker + Acceptable Ads allowed → recover ads              [P][I]
                blocker + AA off  → optional "please allowlist" message     [P]
 5. RECOVER     /trustedIframe.html  sandboxed frame on the Acceptable-Ads   [O][P]
                allowlist; inside it, a Prebid auction to
                pbs.btloader.com/openrtb2/auction (OpenRTB 2.5)            [O]
                → user_sync.html cookie-matching for every bidder           [O]
 6. MEASURE     /pv page views, /log + /evts telemetry → revenue reporting  [O][I]
```

## Why the ads get through an adblocker
- **[P]** Adblock Plus, AdBlock and other eyeo-licensed blockers ship the **Acceptable Ads**
  exception list (on by default). Ads that meet its size, placement and labelling rules,
  served from allowlisted infrastructure, aren't blocked. eyeo **owns** Blockthrough (acquired 2022):
  the company that makes the blocker also sells the ads that get past it.
- **[O]** Blockthrough's sellers.json contains "Eyeo Test Organization"
  (`ad-test.networkfiltering.eyeo-staging.it`), so the two systems are tested together.
- **[O]** Hard blockers (uBlock Origin, AdGuard) block `||btloader.com^` outright
  (AdGuard Base filter, line 639). Acceptable Ads only works on blockers that opt in.

## The anti-blocker lever: making btloader a dependency
**[O]** Filter maintainers keep having to **un-block** btloader so sites stay usable:
- `@@||btloader.com/tag?h=prismamedia-com&upapi=true$script,domain=maxisciences.com|gentside.*|ohmymag.*`
  (uBO + AdGuard) — Prisma Media sites break or wall the page when the tag fails to load.
- `||btloader.com/tag?$redirect=noopjs,domain=voici.fr` — AdGuard serves a **fake empty
  script** so the page *thinks* btloader loaded.
- `||btloader.com^$script,redirect=noopjs,domain=ign.com` — "video breakage" on IGN without it.
- `@@||btloader.com/tag?$xhr,domain=quackr.io`.

So publishers wire their pages so that "btloader didn't load" means "adblocker
present", then show a wall or break features. That makes blocking btloader
costly for the user, and that cost is the commercial pressure.

## Second key format
**[O]** The tag accepts `o=<16-digit sellers.json id>` **or** `h=<host key>`
(e.g. `h=prismamedia-com`), mapping to the "Prisma Media" seller (`5644437305688064`).

## What to do to verify the [I] items
Allow `btloader.com` in the network settings, fetch `btloader.com/tag?o=5150306120761344&upapi=true`,
run REA (`analyze-javascript-application`) for endpoints and storage keys, then load
one page twice in Playwright (with and without a blocker extension) and diff the
`/exd`, `/device` and `/pv` payloads.
