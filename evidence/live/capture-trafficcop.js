// Honest headless load (no spoofing). Record pubguru/m2 requests + bodies + responses.
const { chromium } = require('playwright');
const fs = require('fs');
const [url, out] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const log = [];
  const re = /pubguru|m2\.ai|monetizemore|fouanalytics|b2c\.com/;
  page.on('request', q => { if (re.test(q.url())) log.push({ method: q.method(), url: q.url(), body: (q.postData() || '').slice(0, 20000) }); });
  page.on('response', async r => { if (re.test(r.url()) && !/\.js(\?|$)/.test(r.url())) { try { log.push({ resp: r.url(), status: r.status(), body: (await r.text()).slice(0, 5000) }); } catch (e) {} } });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.mouse.move(200, 300); await page.mouse.wheel(0, 600);
  await page.waitForTimeout(15000);
  const cookies = (await ctx.cookies()).filter(c => /^(m2_|pg_|tc_)/.test(c.name)).map(c => ({ name: c.name, value: c.value.slice(0, 200) }));
  const captcha = await page.evaluate(() => !!document.querySelector('iframe[src*="recaptcha"], #pg-captcha, [id*="captcha"]'));
  fs.writeFileSync(out, JSON.stringify({ url, log, cookies, captchaShown: captcha }, null, 1));
  await ctx.close(); await browser.close(); console.log('done');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
