// Same honest headless load, but acting like an adblocker in OUR OWN browser:
// mode "aa":  block ad-blocking baits (ch=2, doubleclick, bait classes) but allow ch=1 (Acceptable Ads bait)
// mode "all": block every bait incl. ch=1 and dns-finder
const { chromium } = require('playwright');
const fs = require('fs');
const [url, out, mode] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const log = [];
  const blockRe = mode === 'all'
    ? /ad-delivery\.net\/px\.gif|doubleclick\.net\/favicon\.ico|dns-finder\.com/
    : /ad-delivery\.net\/px\.gif\?ch=2|doubleclick\.net\/favicon\.ico/;
  await page.route(blockRe, r => { log.push({ blocked: r.request().url() }); return r.abort('blockedbyclient'); });
  await page.addInitScript(() => {
    const css = '.ad_row,.adbannertop,.ad-mobile,.ad_sidebar,.adpopup,.boxad,.contentAd{display:none!important}';
    const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add) : add();
  });
  page.on('request', q => { if (/btloader/.test(q.url())) log.push({ method: q.method(), url: q.url(), body: q.postData() }); });
  page.on('response', async r => { if (/btloader\.com\/(country|websiteconfig)|cdn\.api\.btloader\.com\/device/.test(r.url())) { try { log.push({ resp: r.url(), body: (await r.text()).slice(0, 3000) }); } catch (e) {} } });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(15000);
  const st = await page.evaluate(() => { try { return JSON.parse(JSON.stringify(window.__bt_intrnl)); } catch (e) { return String(e); } });
  const ls = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => /bt|BT/.test(k)).map(k => [k, localStorage.getItem(k).slice(0, 1500)])));
  fs.writeFileSync(out, JSON.stringify({ url, mode, log, __bt_intrnl: st, localStorage: ls }, null, 1));
  await ctx.close(); await browser.close(); console.log('done', mode);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
