// A `browser` for tools/shoot.mjs backed by Playwright's headless Chromium, so the
// same runner and shot tables drive the omp eval cell and the command line.
// It implements the part of omp's tab API the runner uses: open, close, and on a tab
// goto, evaluate, run, addInitScript, waitForSelector, errors, requests.
import { chromium } from 'playwright-core';

const urlOf = (loc) => (loc && loc.url ? ` (${loc.url})` : '');

export async function launchBrowser({ executablePath } = {}) {
  let pw;
  try {
    // A dead X forward in DISPLAY makes headless Chromium hang on its first screenshot, so the browser does not see it.
    const env = { ...process.env };
    delete env.DISPLAY;
    pw = await chromium.launch({ headless: true, executablePath, env });
  } catch (e) {
    throw new Error(`cannot start Chromium: ${String(e.message || e).split('\n')[0]}\n(tools/package.json pins playwright-core to the Chromium in ~/.cache/ms-playwright; pass --executable to use another)`);
  }
  const open = new Map();

  return {
    async open({ name, viewport }) {
      // Fresh context per tab: no stored scheme, cache or service worker survives.
      const context = await pw.newContext({
        viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block',
        locale: 'en-US', timezoneId: 'UTC',
      });
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push({ text: m.text() + urlOf(m.location()) }); });
      page.on('pageerror', (e) => errors.push({ text: `uncaught: ${e.message || e}` }));
      page.on('response', (r) => requests.push({ url: r.url(), status: r.status() }));
      page.on('requestfailed', (r) => requests.push({ url: r.url(), status: 0 }));
      const tab = {
        page,
        goto: (url) => page.goto(url, { waitUntil: 'load' }),
        evaluate: (fnOrExpr) => page.evaluate(fnOrExpr),
        run: (fn, o = {}) => fn({ page, tab }, ...(o.args ?? [])),
        addInitScript: (content) => context.addInitScript({ content }),
        waitForSelector: (sel, o = {}) => page.waitForSelector(sel, { timeout: o.timeout ?? 30000 }),
        errors: async () => ({ entries: errors }),
        requests: async () => requests,
      };
      open.set(name, { context, tab });
      return tab;
    },
    async close({ name }) {
      const t = open.get(name);
      if (!t) return;
      open.delete(name);
      await t.context.close();
    },
    async shutdown() {
      for (const t of open.values()) await t.context.close().catch(() => {});
      open.clear();
      await pw.close();
    },
  };
}
