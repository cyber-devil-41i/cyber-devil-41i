# Blockthrough, Explained in Plain English

*What it is, how it works, what it collects, and what we proved. Based on the real
scripts and live tests run on 28 October 2026.*

---

## 1. The short version

Blockthrough is a company that helps websites **make money from visitors who use
adblockers**.

When you visit a site that uses it, a small program loads in your browser and asks
three questions:

1. **Do you have an adblocker?**
2. **If yes, does your adblocker allow "Acceptable Ads"?**
3. **Are you blocking ads at the network level** (for example with Pi-hole)?

If you have an adblocker **and** it allows Acceptable Ads, Blockthrough loads a
large ad system and shows you ads anyway, ads your blocker has agreed to let
through. If your blocker blocks everything, Blockthrough gives up.

Blockthrough is owned by **eyeo**, the company that makes **Adblock Plus** and
**AdBlock**. So the same company makes the adblocker and sells the ads that get past it.

---

## 2. Who uses it

Blockthrough publishes a public list of the companies it sells ads for. This list
is called **sellers.json**. It includes large names such as:

- 9gag, MSN (Microsoft), Yahoo, Quora, Fandom, BuzzFeed, WebMD
- People Inc. (people.com, verywellhealth.com), Hearst, Gannett, Ziff Davis
- Daily Mail, New York Post, Le Monde, Reach PLC
- Ad companies that resell to many smaller sites: Playwire, Freestar, CafeMedia,
  Venatus, Ezoic, Publift, Setupad

A web crawler run by DuckDuckGo found Blockthrough's script on **about 3,800 websites**.

### How to tell which company a site belongs to

Every site that uses Blockthrough loads a script with an address like this:

```
https://btloader.com/tag?o=5741299960381440
```

The number after `o=` is the **seller ID** from Blockthrough's sellers.json. In our
test on 9gag.com, the number was `5741299960381440`, which the list names as "9gag".
So you can open any site's page source and see exactly which account gets paid.

---

## 3. How it works, step by step

### Step 1: The script loads
The website (or its tag manager) loads `btloader.com/tag`. It is a 200 KB program.

### Step 2: It sets traps ("baits")
Adblockers work by blocking web addresses and hiding page elements that look like
ads. Blockthrough uses this against them. It creates fake ad-like things and
watches whether they get blocked.

| Bait | What it looks like | What it reveals |
|---|---|---|
| **Fake Google ad address** | `ad.doubleclick.net/favicon.ico?ad=300x250&adnet=1&showad=1…` | If this is blocked, you have an adblocker |
| **Bait image, channel 2** | `ad-delivery.net/px.gif?ch=2` | If this is blocked, you have an adblocker |
| **Fake ad box** | an invisible box with class names like `ad_row adbannertop boxad` | If your blocker hides it, you have an adblocker |
| **Bait image, channel 1** | `ad-delivery.net/px.gif?ch=1` | If this loads while the others are blocked, your blocker **allows Acceptable Ads** |
| **DNS check** | `ab.dns-finder.com/meta/dns` | If this fails, you're blocking at the network level (Pi-hole, NextDNS, AdGuard DNS) |

The requested files are harmless: a tiny icon and a 1-pixel image. The only
purpose is to see whether they get through. Each request has a random number added
so a cached answer can't fool it. The tests repeat several times to avoid mistakes.

### Step 3: It asks your adblocker directly
This is the most unusual part.

Blockthrough loads a hidden page called `btloader.com/trustedIframe.html`.
**Adblock Plus and AdBlock recognise this page** and give it a special function
called `sendExtCommand`. Using it, Blockthrough asks your adblocker:

- **"Is Acceptable Ads turned on?"**
- **"Has the user allowlisted this website?"**
- **"Does the user pay for Premium?"**
- **"Which experiments is this user part of?"**

So Blockthrough doesn't only guess from the baits: on eyeo's own adblockers, it
can get a direct answer.

### Step 4: It decides
The rule, taken from the code:

> **Show recovered ads only if:** an adblocker is present **AND** Acceptable Ads is
> allowed **AND** the visitor is **not** on an iPhone or iPad.

The result is saved in your browser's storage under the name `BT_AA_DETECTION`,
for example `{"ab":true,"aa":true,"nlf":false}`:
- `ab` = adblocker present
- `aa` = Acceptable Ads allowed
- `nlf` = network-level filter present

### Step 5: It serves ads (only if the rule says yes)
Blockthrough downloads a second, much bigger program: `btloader.com/recovery`, about
**1 MB**. This is a full advertising system:

- **Prebid.js** (version 11.27), the industry tool for running a live auction for each
  ad space, with **more than 40 ad buyers** including Magnite, PubMatic, OpenX,
  Amazon, Criteo and TripleLift
- **Google Ad Manager**
- **Tracking ID systems** that recognise you across different websites: UID2,
  European UID, LiveRamp, ID5, Criteo ID, LiveIntent, SharedID, Unified ID,
  IntentIQ and more

The ads are shown inside small sandboxed frames from `static.btloader.com/safeFrame.html`.

### Step 6: It reports back
Blockthrough sends reports to its servers about what it found and whether it
served an ad (details in Section 5).

---

## 4. What we proved with live tests

We loaded 9gag.com three times in a test browser and changed only one thing: how
the browser behaved toward the bait.

| Test | What we simulated | Blockthrough's verdict | What it did |
|---|---|---|---|
| 1 | No adblocker | `ab: false` | **Nothing.** The site's normal ads ran. |
| 2 | Adblocker that allows Acceptable Ads | `ab: true, aa: true` | **Loaded the 1 MB ad system** and set up 2 ad frames |
| 3 | Strict adblocker that blocks everything | `ab: true, aa: false` | **Gave up.** No ads served. |

This matches the code exactly.

---

## 5. What it collects about you

Copied from the real requests captured during our tests.

### Sent to `api.btloader.com/exd` (the "what did we detect" report)
- The website's ID and the seller's ID
- The **full address of the page** you're reading
- What your adblocker told the hidden page (Acceptable Ads status, allowlist, Premium)
- How long the hidden page took to load

### Sent to `api.btloader.com/pv` (the "page view" report)
- The full page address
- Your **window size** (e.g. 1280×720)
- Whether Acceptable Ads is allowed
- **Whether you seem to be in private/incognito mode** (it checks your browser's
  storage allowance, which is smaller in private mode)
- The **result of every single bait test**, with timings

### Sent to `cdn.api.btloader.com/device`
- Your browser's detailed version list (brand and exact version numbers)
- In return it gets a **device ID from a company called 51Degrees**, which identifies
  your type of device. This is saved in your browser for about a year.

### Sent to `api.btloader.com/country`
- Nothing extra. The server works out your **country from your IP address** and
  replies, for example, `{"country":"US","isRestricted":false}`.

### Also read by the script
- Your browser's identity string (user agent) and platform
- Screen size and pixel density
- Memory information (Chrome only)
- Whether your browser accepts third-party cookies (it tests this with a hidden page
  called `cchecker.html`)

### If you get recovered ads
The 1 MB ad system adds everything a normal ad auction collects, including the
cross-site tracking IDs listed in Step 5. "Acceptable" refers to how the ad
**looks** (size, placement, labelling). It does **not** mean less tracking.

---

## 6. Why blocking it can break websites

Some sites make Blockthrough a requirement. If its script fails to load, they
assume you use an adblocker and show a wall or break features.

Adblock filter maintainers (uBlock Origin, AdGuard) have had to write special rules
for this. On some sites they **let Blockthrough through**; on others they swap in a
**fake empty script** so the site thinks it loaded. Examples found in their public
filter lists: Prisma Media's sites (gentside, ohmymag, maxisciences), voici.fr,
ign.com and quackr.io.

---

## 7. A security problem we found

The ad frame page `static.btloader.com/safeFrame.html` listens for messages from
other web pages. It **does not check who sent the message**. If the message says
"eval", it **runs whatever code is inside**.

In plain terms: any website could load this page in a hidden frame and make it run
code under Blockthrough's web address. The damage is limited to that one address
and its stored data, but it's a basic security mistake. The fix is simple: only
accept messages from trusted senders and remove the "run any code" feature.

**We didn't exploit it.** It should be reported privately to Blockthrough/eyeo.

---

## 8. Problems in Blockthrough's sellers.json

- **A test account is left in the public list:** "Eyeo Test Organization" with a
  staging address (`ad-test.networkfiltering.eyeo-staging.it`)
- **Two different ID formats** are mixed: long numbers and short codes like
  `f65cfbd4`. It looks like two lists merged after an acquisition.
- **It disagrees with Google's list:** Blockthrough calls its own Google account an
  "intermediary"; Google lists the same account as "both".
- **One web address is used for four different companies:** `iqdigital.de` stands in for
  ZEIT, FAZ, Handelsblatt and IQ Digital.
- **Company addresses instead of website addresses** (e.g. `people.inc`, `pmc.com`,
  `yahooinc.com`), so ad buyers can't easily check which sites they're really buying.
- **Typos:** "Nextstar" (should be Nexstar), "Mediahius" (should be Mediahuis)

---

## 9. What we could not confirm

- **Your adblocker's real answers.** We simulated an adblocker by blocking the bait
  addresses ourselves; we didn't install Adblock Plus. So the direct conversation
  between Adblock Plus and Blockthrough's hidden page (Step 3) is **confirmed in the
  code** but was **not observed live**.
- **What the iPhone/iPad exclusion is for.** The code skips Apple mobile devices, but
  doesn't say why.
- **What the experimental baits are for.** Six extra hidden test boxes with random
  names exist in the code and are marked experimental.

---

## 10. How this analysis was done

1. **Sellers lists:** read Blockthrough's sellers.json and Google's sellers.json
   (952,560 entries) to find who uses it and which IDs belong to whom.
2. **Crawler data:** used DuckDuckGo's public Tracker Radar data, which lists what the
   script reads and which sites load it.
3. **Real code:** downloaded the three real files (`tag`, `recovery`,
   `trustedIframe.html`) with a normal request, no disguises.
4. **REA:** ran the REA reverse-engineering tool on the code to map its parts and
   web addresses, then read the formatted code by hand.
5. **Live tests:** loaded 9gag.com in an automated browser that openly identified
   itself as automated, three times, as described in Section 4.
6. **Evidence:** saved in this repository under `evidence/live/`. The vendor's
   scripts aren't copied here; only their fingerprints (SHA-256 hashes) are, so anyone
   can check they have the same version.

| File | Version / fingerprint |
|---|---|
| `btloader.com/tag` | client version 2.1.196, SHA-256 `cf26c59c…` |
| `btloader.com/recovery` | SHA-256 `628ec616…` |
| `btloader.com/trustedIframe.html` | SHA-256 `dd416fc9…` |

---

## 11. One-paragraph summary

Blockthrough is a script, owned by Adblock Plus's parent company eyeo, that runs on
about 3,800 websites. It plants fake ads and checks whether your adblocker removes
them; on Adblock Plus and AdBlock it can also ask the adblocker directly. If you block
ads but allow "Acceptable Ads", and you're not on an iPhone or iPad, it loads a full
1 MB advertising system with over 40 ad buyers and a dozen cross-site tracking
systems. Along the way it records the page you're reading, your window size, whether
you seem to be in private mode, your country, and a device ID from 51Degrees. Its
public seller list has errors, including a leftover test account, and one of its ad
frames has a security flaw that lets any website run code inside it.
