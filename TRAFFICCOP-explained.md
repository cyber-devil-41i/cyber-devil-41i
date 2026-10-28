# MonetizeMore Traffic Cop, Explained in Plain English

*What it is, how it works in your browser, what it collects, and what we proved.
Based on the real script and a live test run on 28 October 2026.*

---

## 1. The short version

Traffic Cop is a product from a company called **MonetizeMore** (its ad platform is
called **PubGuru**). Its job is to answer one question:

> **Is this visitor a real person, or a bot?**

Websites that run Google ads can lose their ad accounts, or have earnings taken back,
if too many "visitors" turn out to be bots. Traffic Cop protects them: before ads load,
it checks you. If you look like a bot, it can **hide the ads** and show you a
**"prove you're human" CAPTCHA**.

To decide, it watches how you behave on the page, inspects your browser in detail
(about **128 measurements**), and sends everything to MonetizeMore's server, which
returns a **bot score from 0 to 100**.

---

## 2. Who uses it

MonetizeMore publishes a public list of the websites it sells ads for, called
**sellers.json**. The part we reviewed had 112 entries, including:

- hamariweb.com, wvnews.com, marineweather.net, statisticsbyjim.com, automateexcel.com
- cartermatt.com, dailyhealthpost.com, will-mixen.de, visioncenter.org
- apkmirror.com, letssingit.com, tbsnews.net, jugantor.com, diply.com

DuckDuckGo's web crawler saw Traffic Cop running on these and others, such as
**rapidtables.com**, **dmv.com**, **pissedconsumer.com** and **audiogon.com**. Some sites
(like rapidtables) use Traffic Cop **on its own** in front of a different company's ads.

### How to tell if a site runs it
Look in the page source for a script like:

```
https://c.pubguru.net/pg.<site-name>.js
```

For example `pg.rapidtables.com.js` or `pg.wvnews.js`. That file loads Traffic Cop.

---

## 3. The three modes a website can choose

| Mode | What happens when a bot is suspected |
|---|---|
| **Measure** (the default) | Nothing visible. The score is recorded for reporting only. Ads still load. |
| **Block** | Ads are **held back** and the visitor sees a **Google reCAPTCHA**. |
| **No-CAPTCHA** | Ads are held back, but no CAPTCHA is offered. |

Other settings each website can change:
- **Bot threshold:** the score above which you're treated as a bot. **Default: 75.**
- **Sample rate:** what share of visitors get checked (not everyone is).
- **Time limit:** how long ads wait for a verdict (default half a second), and what to do
  if the server is slow.
- **Click blocker:** extra protection against repeated clicks on ads.

---

## 4. How it works in your browser, step by step

### Step 1: Ads are put on hold
The site loads `pg.<site>.js`, which loads Traffic Cop. The site's Google ads are put
into a waiting line (the code calls it `pg.atq`). **No ad loads until Traffic Cop
releases the line.**

### Step 2: It checks whether to run at all
- If your **cookie-consent choice** doesn't allow tracking, it stops.
- It only checks a **sample** of visitors. It flips a coin based on the site's sample
  rate and remembers the result in a cookie called `pg_tc` (`sample` or `not-sampled`).
  In our test, wvnews.com came back `not-sampled`, so that visit wasn't checked.

### Step 3: It watches how you behave
It starts counting, every 50 milliseconds:
- mouse movements and clicks
- key presses
- scrolling (and when scrolling stops)
- finger touches and swipes
- switching away from the tab and back

**Why:** real people move the mouse, scroll and touch. Simple bots do nothing, or
move in unnaturally perfect ways.

### Step 4: It sets invisible traps ("honeypots")
It adds two links to the page that **you can't see**:
- one with the text "Don't click me"
- one wrapped around a tiny 1-pixel image

A human never clicks something invisible. **If either link is clicked, it's almost
certainly a bot**, and a cookie `m2_honeypot=1` is saved for 10 days.

### Step 5: It times your computer
It runs a small maths task (multiplying a 100 × 100 grid of numbers) and measures how
long it takes. Bot farms often run on virtual machines with unusual speeds, so the
timing helps spot them.

### Step 6: It fingerprints your browser
It collects about **128 measurements**. In plain groups:

**"Are you a robot program?"**
- Is `navigator.webdriver` on? This flag is set by browser-automation tools.
- Are there leftovers from known bot tools: **Selenium, PhantomJS, Nightmare,
  Puppeteer/ChromeDriver**, or code environments like **Node.js, JSDOM, Rhino**?
- Is the browser running "headless" (no visible window)?

**"What is your graphics card?"**
- It reads the **real name of your graphics chip** through WebGL, plus about 20 technical
  limits of it.
- A **software renderer** like "SwiftShader" means there's no real screen, a strong sign of
  a server-based bot.

**"Are you inspecting us?"**
- It checks whether **developer tools are open** (by window-size gaps and other tricks).

**"Does your browser look normal?"**
- Number of plugins and file types (bots often have **zero**)
- Window, screen and available-screen sizes, and whether they make sense together
- Memory size, timezone, language, colour settings, touch support, pointer type
- Whether the page is inside a frame, how many redirects led here, how many pages are
  in your history

**"Have you changed since last time?"**
- Did your **IP address, browser identity, screen width or device type** change since your
  last visit? Bots often rotate these.
- Your **previous bot score** and whether you solved a CAPTCHA before.

### Step 7: It asks MonetizeMore's server
All of this is packed into one message and sent to:

```
https://a3.pubguru.net/tc
```

The server scores it. The code shows two checks: a **quick check**, then a
**"KNN" check**. KNN (k-nearest-neighbour) is a simple machine-learning method that
compares you with known humans and known bots and asks which group you're closer to.

The server replies with:
- **`bot_percent`**: your bot score, 0 to 100
- **`bot_reason`**: a short reason code (for example `mrf`)
- **`bot_model`**: which model scored you

### Step 8: It acts on the score
- **Score at or below the threshold (75):** the waiting line is released and ads load.
- **Score above 75 in block mode:** a **reCAPTCHA** appears and ads stay hidden.
- **Score above 75 in measure mode:** ads load anyway; the result is only reported.

The verdict is saved in cookies (`m2_bot_percent` for 1 day, `m2_bot_reason` for 10 days),
so you aren't re-scored on every page.

### Step 9: Outside checkers on a few visits
On **1%** of checked visits, it also loads two outside bot-detection services and passes
them your risk score:
- **FouAnalytics** (`api.fouanalytics.com`)
- **b2c.com** (`api.b2c.com`)

---

## 5. What we proved with a live test

We visited **rapidtables.com** with an automated test browser that **openly identified
itself** as automated. We didn't disguise anything.

**What Traffic Cop saw** (from the real message it sent):
- `isHeadLess: 1` and `headlessBrowserName: "WebDriver"`
- Graphics card: `"ANGLE (… SwiftShader …)"`, a software renderer
- Plugins: `0`, file types: `0`
- Mouse moves, clicks, key presses, scrolls: all `0`
- Developer tools: reported as open

**What the server answered:**

```json
{"bot_percent": 99.99, "bot_model": "1", "bot_reason": "mrf", "pg_user": ""}
```

So it **correctly caught our bot**, with a score of 99.99 out of 100.

**No CAPTCHA appeared**, because rapidtables uses **measure** mode: Traffic Cop only recorded
the result.

---

## 6. What it stores in your browser

Cookies seen during our visit, saved on the website's own domain:

| Cookie | What it holds | How long |
|---|---|---|
| `pg_ip` | **Your IP address** | about 30 days |
| `pg_geo` | Your country and IP | session |
| `pg_ua` | **Your full browser identity string** | about 10 days |
| `pg_mm2_cookie_a` | A **visitor ID** that recognises you on return | **1 year** |
| `pg_lava` | A "PubGuru user" ID from the server | 180 days |
| `pg_bot_percent` / `pg_bot_reason` / `pg_bot_model` | Your bot score and why | 1 to 10 days |
| `pg_tc` | Whether you're in the checked sample | 1 day |
| `pg_quick_check`, `pg_tc_device`, `pg_inner_width`, `pg_tc_platform` | Results of individual checks | 1 day |
| `pg_latency_before_tc`, `pg_tc_response_time`, `pg_pv_time_1` | Timing measurements | 1 day |
| `pg_session_id`, `pg_session_depth` | Your current visit and how many pages deep | about 1 hour |

The wider PubGuru ad system on the same sites also stores marketing-campaign details
(`pg_utm_*`) and cross-site advertising IDs from other companies.

---

## 7. Is this fair?

**What makes sense:**
- Bot traffic is a real problem. It costs advertisers money and gets websites banned.
- Behaviour, automation flags and graphics-card checks are standard, effective ways to
  catch bots. Our test bot was caught instantly.

**What goes beyond catching bots:**
- Storing your **IP address in a cookie for 30 days** and your **full browser identity
  for 10 days** isn't necessary just to say "human or bot".
- A **1-year visitor ID** is a tracking tool, not a fraud tool.
- Checking whether your **developer tools are open** treats curious users as suspects.
- The decision is made by a **secret model on MonetizeMore's server**. If a real person is
  wrongly flagged (for example someone using a privacy browser, a remote desktop, or an
  older computer), they get a CAPTCHA or no content, with no explanation.

---

## 8. Earlier security issue in a related plugin

The **Advanced Ads** WordPress plugin, which connects sites to PubGuru and Traffic Cop:
- **turns off HTTPS certificate checking** when it downloads its settings from PubGuru, and
- puts a value from those settings **straight into the page without cleaning it**.

Together, someone able to tamper with that connection could inject their own script into
every page of the site. The fix: turn certificate checking back on, and validate the value.

---

## 9. What we could not confirm

- **How the server's model weighs each signal.** It runs on MonetizeMore's server, so we
  can see what goes in and what comes out, but not the reasoning in between.
- **What the reason codes mean.** Codes like `mrf` aren't explained in the browser code.
- **The CAPTCHA screen in action.** Our live test site uses measure mode, so no CAPTCHA was
  triggered. The CAPTCHA logic is confirmed in the code only.

---

## 10. How this analysis was done

1. **Sellers lists:** read MonetizeMore's sellers.json and Google's sellers.json to find who
   uses it and which accounts belong to whom.
2. **Crawler data:** used DuckDuckGo's public Tracker Radar data. Its record of the script
   matches our downloaded copy exactly (same SHA-256 fingerprint `166a1563…`).
3. **Plugin code:** read the open-source WordPress plugin that installs Traffic Cop.
4. **Real code:** downloaded the real Traffic Cop script with a normal request, no
   disguises, formatted it (about 6,650 lines) and read it.
5. **Live test:** one visit to rapidtables.com and one to wvnews.com with an automated
   browser that openly identified itself. We recorded what was sent and received.
6. **Evidence:** saved in this repository under `evidence/live/`. The vendor's script isn't
   copied here, only its fingerprint, so anyone can check they have the same version.

| File | Version / fingerprint |
|---|---|
| `c.pubguru.net/tc/trafficcop-async-min-main.js` | build `260531-fe1`, SHA-256 `166a1563…` |
| `c.pubguru.net/pg.rapidtables.com.js` | SHA-256 `faa70e0b…` |
| Build running on rapidtables during the test | `tc-260303-61d` |

---

## 11. One-paragraph summary

Traffic Cop is MonetizeMore's bot detector, used on sites that sell ads through PubGuru and
some that don't. When you open such a site, it puts the ads on hold, watches your mouse,
keyboard, scrolling and touches, plants invisible trap links, times your computer, and
records about 128 details of your browser, including signs of automation tools and the real
name of your graphics card. It sends all of this to MonetizeMore's server, which replies with
a bot score. Above 75, a site in "block" mode hides its ads and shows a CAPTCHA; a site in
"measure" mode just records it. In our test it scored our automated browser 99.99 out of 100.
Along the way it stores your IP address, full browser identity and a one-year visitor ID in
cookies, which goes further than bot detection needs.
