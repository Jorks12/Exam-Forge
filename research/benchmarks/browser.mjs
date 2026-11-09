import { chromium } from 'playwright';

const origin = process.env.EXAMFORGE_MEASURE_URL ?? 'http://127.0.0.1:3019';
const browser = await chromium.launch({ channel: process.env.EXAMFORGE_BROWSER_CHANNEL });
const samples = [];
try {
  for (let run = 0; run < 7; run++) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      window.metrics = { lcp: 0, cls: 0 };
      new PerformanceObserver(list => {
        window.metrics.lcp = list.getEntries().at(-1)?.startTime ?? 0;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.metrics.cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(origin + '/login', { waitUntil: 'networkidle' });
    await page.locator('h1').waitFor();
    const result = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      const scripts = resources.filter(item => item.initiatorType === 'script' || /\.js(?:\?|$)/.test(item.name));
      const navigation = performance.getEntriesByType('navigation')[0];
      return { ...window.metrics, ttfb: navigation.responseStart, requests: resources.length,
        scriptBytes: scripts.reduce((sum, item) => sum + item.encodedBodySize, 0) };
    });
    if (run > 0) samples.push(result);
    await page.close();
  }
  console.log(JSON.stringify({ route: '/login', runs: samples.length,
    median: Object.fromEntries(Object.keys(samples[0]).map(key => {
      const ordered = samples.map(sample => sample[key]).sort((a, b) => a - b);
      return [key, (ordered[2] + ordered[3]) / 2];
    })), samples }, null, 2));
} finally { await browser.close(); }
