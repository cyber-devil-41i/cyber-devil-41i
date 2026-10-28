# DoubleVerify: Technical and Privacy Report

*Scripts downloaded 28 October 2026 and analysed with REA 6.8.0, a manual read of the
formatted source, and DuckDuckGo Tracker Radar crawl data.*

> **Scope note.** This report covers what DoubleVerify does, how it's built, which
> standards it measures against, and what data leaves your browser. The internals of its
> automation/bot checks are **deliberately left out**: a detailed map of those works as
> a guide to evading them.

---

## 1. Summary

DoubleVerify (DV) is an **ad verification** company. Advertisers and publishers pay it to
answer three questions about every ad shown:

1. **Was it seen?** (viewability: was enough of the ad on screen for long enough?)
2. **Was it seen by a real person?** (fraud / invalid traffic, "IVT")
3. **Was it next to suitable content?** (brand safety and suitability)

It does this with JavaScript that loads **with the ad** (inside the ad's frame) or **on the
publisher's page**, measures what happens, and reports to DV's servers. Advertisers use
the results to **refuse to pay** for bad impressions, or to **block** the ad before it
renders.

Key findings:
- DV's scripts appear on **~2,100 sites** (`doubleverify.com`) plus **~440** (`dv.tech`) in
  DuckDuckGo's crawl, with the **maximum fingerprinting score (3/3)**.
- The ad tag reports about **60 parameters** per impression, including the **page URL, the
  referrer chain through nested frames, window and screen sizes, user agent and GDPR consent**.
- The main engine (`dvbm.js`) contains a **server-switched, sampled upload of the full page
  HTML**, and of every parent frame up to the top window, to a Google Cloud Storage bucket
  named **`gp-ms-us-gcs-fraud`**. REA independently confirmed this endpoint with
  `confidence: exact`.

---

## 2. The scripts

| File | Size | Formatted | Build | Role |
|---|---|---|---|---|
| `cdn.doubleverify.com/dvbm.js` | 555 KB | 28,265 lines | `v11094 d89d07d5` | Main **measurement engine**: viewability, attention, fraud signals, page capture |
| `cdn.doubleverify.com/dvbs_src_internal141.js` | 103 KB | 4,611 lines | tag `6.1.src` | **Ad tag** ("bs" = brand safety): per-impression checks, reporting, blocking |
| `cdn.doubleverify.com/dvtp_src.js` | 11 KB | 631 lines | `v11094 d89d07d5` | Small **loader**, also for video (OMID) |

SHA-256 fingerprints: `evidence/live/human-dv-script-sha256.txt`.

### Other DV files seen by DuckDuckGo's crawl
| Resource | Sites | Type |
|---|---|---|
| `doubleverify.com/dvbm.js` | 1,129 | Script |
| `doubleverify.com/verify.js` | 791 | Script |
| `doubleverify.com/bsevent.gif` | ~890 | Ping / image (reporting pixel) |
| `doubleverify.com/dvbs_src.js` | 432 | Script |
| `doubleverify.com/visit.js` | 398 | Script |
| `doubleverify.com/dvbs_src_internal141.js` | 370 | Script |
| `doubleverify.com/dvtp_src.js` | 357 | Script |
| `dv.tech/` · `dv.tech/bsevent.gif` · `dv.tech/event.png` | ~400 | Ping / image / fetch |
| `dv.tech/dvtag/<id>/<id>/pub.js` | 11 | Publisher tag (e.g. babycenter.com) |

Example sites: WebMD, People, Mashable, PCMag, Lifehacker, Fandango, Target, Cambridge
Dictionary, TV Tropes, Ars Technica, CarGurus, 247Sports, Psychology Today.

### Server hostnames found in the code
`cdn.doubleverify.com`, `tps.doubleverify.com` (`/visit.jpg`), `rtb0.doubleverify.com`
(error and event reporting), `cdn.dv.tech`, `pub.doubleverify.com`, and
`storage.googleapis.com/gp-ms-us-gcs-fraud`.

---

## 3. REA analysis results

| Script | REA evidence ID | AST nodes visited | Findings | Graph |
|---|---|---|---|---|
| `dvbm.js` | `ev_95a16fd3cbf4b31c1e66…` | 135,869 | 84 | 67 modules, 3 endpoints |
| `dvbs_src_internal141.js` | `ev_b01444c5064adab5800e…` | 23,185 | 90 | 41 modules |
| `dvtp_src.js` | `ev_fe5460d59315079e0751…` | 3,000 | 7 | 6 modules, 2 endpoints |

All three parsed with **0 parse failures** and no integrity contradictions.

**Endpoints REA extracted:**
- `dvbm.js`: **`https://storage.googleapis.com/gp-ms-us-gcs-fraud`**, via `XMLHttpRequest.open`
  (`ast-static-analysis`, state `observed`, confidence **`exact`**). Two more low-confidence
  candidates were the parameter names `ctx` and `cmp`, not network targets.
- `dvtp_src.js`: two `fetch()` calls whose targets are built at runtime (`partial` resolution).

**What REA can't tell us:** most of DV's URLs are assembled at runtime from server
config (e.g. `"https://" + ServerPublicDns + "/bsevent.gif"`), so static analysis sees
the pieces but not the final address. REA states this itself: *"AST coverage is incomplete;
omitted or dynamic facts must not be interpreted as absence."* The endpoint list above was
completed by reading the code.

---

## 4. How it works

### 4.1 Delivery
- **Inside the ad.** When an advertiser buys through a platform with DV verification, the
  creative is "wrapped": the ad's code loads DV's tag first. That's why DV runs **inside the
  ad's iframe**, often several frames deep.
- **On the page.** Publishers can also load DV directly (`dv.tech/dvtag/…/pub.js`) to measure
  their own inventory and pass signals to their ad server.
- **Video.** `dvtp_src.js` handles video and **OMID** (the IAB Open Measurement SDK), the
  industry interface that lets verification vendors measure inside video players and apps.

### 4.2 Viewability measurement
The engine (`dvbm.js`) contains a full viewability system: a "standards registry", interval
timers, visibility-change callbacks and percentage-in-view calculations. Its configuration
names the industry standards it measures against (`IAB`/`MRC` ×60+ references, `GroupM`
×61):

| Standard | Rule (public industry definitions) |
|---|---|
| **IAB / MRC display** | at least **50%** of the ad's pixels on screen for **1 continuous second** |
| **IAB / MRC video** | at least **50%** on screen for **2 continuous seconds** |
| **GroupM** (stricter, advertiser-defined) | **100%** of pixels in view, with sound/engagement requirements for video |

What the code tracks to compute this:
- how much of the ad is inside the visible window (**percentage in view**)
- for how long (**interval data**, viewable interval counts)
- whether the **tab is visible and focused** (`visibilitychange`, focus handling, a
  "strict focus" mode)
- **share of screen** the ad takes up
- **mouse movement** over or near the ad (`mouseMoveMeasured`, `mouseMoveData`), used for
  attention/engagement metrics
- **unload timing**, i.e. how long the ad was displayed before the user left

### 4.3 Brand safety and placement
To judge where an ad ran, the ad tag works out the **real page URL** even from inside nested
iframes:
- it walks up the frame chain using `document.referrer` at each level, keeping the depth
- it records `referrer`, `refD`, `srcurlD`, `aUrl`, `turl`, `wrapperurl` and whether it's
  in an `iframe`
- this lets DV say "this ad actually ran on site X", even when the ad was resold through
  several exchanges

That URL is then checked against DV's content classification on its servers. If the page is
unsuitable for the advertiser, DV can **block** the impression: the ad tag has an explicit
**`isbadimp`** (bad impression) flag and a **`dvp_isLostImp`** (lost impression) path.

### 4.4 Fraud / invalid traffic
The scripts include **automation and browser-authenticity checks**, and the result travels with
the impression report. As with Traffic Cop and HUMAN, the **decision is made on DV's servers**,
combining these browser signals with network-level intelligence (data-centre IPs, known
bot networks, abnormal patterns across many impressions).

*(The specifics of these checks are intentionally not documented here. See the scope note.)*

### 4.5 Reporting
Results go back as **image pixels and beacons**, which work even in restricted ad frames:
- `bsevent.gif` (brand-safety / event pixel) on `doubleverify.com` and `dv.tech`
- `tps.doubleverify.com/visit.jpg` (visit / impression event)
- `dv.tech/event.png` (events via fetch / ping)
- `rtb0.doubleverify.com` (errors; parameters prefixed `dvp_js…`)

---

## 5. What data leaves your browser

### 5.1 Per-impression parameters (ad tag, verbatim names)
Parameter names found in `dvbs_src_internal141.js`, grouped:

| Group | Parameters |
|---|---|
| Campaign / ad identity | `ctx`, `cmp`, `plc`, `unit`, `impid`, `sid`, `uid`, `tagtype`, `tagformat`, `tagpb`, `num` |
| **Where the ad ran** | **`referrer`**, **`refD`**, **`srcurlD`**, **`aUrl`**, **`turl`**, **`wrapperurl`**, `urlsrc`, `iframe`, `hist` (history length) |
| **Device and browser** | **`useragent`**, **`nav_pltfrm`** (platform), `touch`, `ssl` |
| **Window and screen** | `winw`, `winh`, `wouw`, `wouh` (inner/outer window), `scaw`, `scah` (available screen) |
| Viewability | `vavbkt` (viewability buckets), `isovv`, `vstvr`, `vssd` |
| Environment | `ismraid` (in-app MRAID), `isdvvid` (video), `htmlmsging`, `sfe`, `fwc`, `foie` |
| **Consent** | **`gdpr`**, **`gdpr_consent`** (the IAB TCF consent string) |
| Verdict flags | **`isbadimp`**, `dvp_isLostImp`, `usig`, `hdsig` |
| Network | `xff` (a forwarded-for value, passed through when present) |
| Errors | `dvp_jsErrMsg`, `dvp_jsErrUrl`, `dvp_isOnHead` |

### 5.2 Browser properties read (DuckDuckGo Tracker Radar, `dvbm.js`, 1,129 sites)
User agent, vendor, platform, **`getHighEntropyValues`** (detailed device and OS data),
`hardwareConcurrency` (CPU cores), `deviceMemory`, `maxTouchPoints`, screen and window sizes,
`screenX/Y`, `devicePixelRatio`, screen orientation, **`prefers-color-scheme`** (dark mode),
`performance.memory`, **`webkitTemporaryStorage`** (storage quota; commonly used to infer
private browsing), `navigator.webdriver`, cookies, timing.

### 5.3 Full page capture (`gp-ms-us-gcs-fraud`)
The most significant privacy finding, from the code:

- **What:** `dvbm.js` takes `document.documentElement.outerHTML`, the **entire HTML of the
  page**, from the current frame and **each parent frame up to the top window** (labelled
  `top`, `iframe_tag`, `iframe_tag_parent`, `iframe_tag_parent_parent`,
  `iframe_top_child`).
- **Where:** `POST https://storage.googleapis.com/gp-ms-us-gcs-fraud`, as a form upload with
  fields `key` and `file`.
- **File name:** built from a config prefix, the **site hostname**, a bit-string of
  detection signals, the **ad ID** and **impression ID**, plus the frame label, ending in `.html`.
- **When:** only if DV's server config enables it (flag `d12`) **and** a random number falls
  under a sampling rate (`d2`). So it's **remote-controlled and sampled**, not on every
  impression. A third argument can force it.
- **Why it matters:** a full page copy can contain **anything shown on the page**: a
  logged-in user's name or email, account details, search terms, private messages, health
  information on a health site. The user isn't told, and the site owner may not know.
- **Not tested:** whether the bucket accepts these uploads without credentials. Testing would
  mean writing to DoubleVerify's storage, so it was not done.

### 5.4 Browser storage
DV's engine uses **`sessionStorage`** (cleared when the tab closes) for its own state. No
long-lived DV cookies were confirmed in this analysis.

---

## 6. Live testing

| Site | Result |
|---|---|
| tvtropes.org | **Blocked by Cloudflare** ("Just a moment…"). The automated test browser was stopped before the page loaded. No attempt was made to get past it. |

So this report rests on **static analysis (REA + manual reading) and DuckDuckGo's crawl
data**, not on a live capture of DV's network traffic.

---

## 7. Assessment

**What's reasonable**
- Viewability measurement to IAB/MRC standards is an industry requirement; advertisers
  shouldn't pay for ads nobody could see.
- Working out the true page URL through frames is how brand safety and anti-fraud
  verification function; resold ad inventory routinely hides where it ran.
- Using only `sessionStorage` instead of long-lived cookies is lighter than many ad-tech scripts.

**What's concerning**
- **Full-page HTML capture** from inside an ad, uploaded to cloud storage on a sample of
  impressions, is far broader than verifying an ad. It can capture personal data from the
  host page, and nothing tells the user it happens.
- **Maximum fingerprinting** (device memory, CPU cores, high-entropy client hints, dark-mode
  preference, private-mode inference) on ~2,500 sites, running inside third-party ads the
  site owner may not control.
- **Opacity:** most URLs and behaviour are switched by server config at runtime, so what a
  given impression does can change without any change to the code.

---

## 8. What to take from this for your own IVT tool

- **Separate the three jobs.** DV keeps viewability, brand safety and fraud as distinct
  measurements with distinct standards. Mixing them into one "quality score" makes results
  impossible to audit.
- **Measure to a named standard.** Implement IAB/MRC viewability exactly (50% / 1 s display,
  50% / 2 s video) before inventing your own. Buyers and auditors expect it.
- **Resolve the true page URL**, or your fraud data is attached to the wrong site.
- **Report with pixels/beacons** (`sendBeacon`, image pixels): they survive restricted
  iframes and page unloads.
- **Keep the decision on the server** and make client behaviour config-driven. But log what
  config each impression ran under, so your own results stay explainable.
- **Don't copy the page-capture approach.** If you need forensic samples, capture minimal,
  redacted data, disclose it, and get it past a privacy review. Under GDPR, uploading full
  page HTML that may contain personal data needs a clear legal basis.
- **Get MRC-aligned.** Read the MRC *Invalid Traffic Detection and Filtration Guidelines*
  (GIVT vs SIVT) and the IAB *Viewable Ad Impression* guidelines.

---

## 9. Evidence

| Item | Location |
|---|---|
| Script fingerprints (SHA-256) | `evidence/live/human-dv-script-sha256.txt` |
| REA evidence IDs | `evidence/live/human-dv-rea-evidence-ids.txt` |
| Crawl data source | `duckduckgo/tracker-radar`: `domains/US/doubleverify.com.json`, `dv.tech.json` |

The vendor's scripts aren't copied into this repository; only their fingerprints are, so
anyone can verify they're analysing the same build.
