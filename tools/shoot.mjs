// Screenshot the reference pages into demo/shots/. Serve the repo root first:
//
//   python3 -m http.server 8793 --bind 127.0.0.1 -d .
//
// then, from an omp JS eval cell (it needs the `browser` global):
//
//   const { shoot } = await import('/path/to/style/tools/shoot.mjs');
//   await shoot(browser);                       // every shot
//   await shoot(browser, ['workbench-loom-dark']);
//
// Each page sets window.__shotReady once fonts and images are in. The scheme
// is forced with ?theme=, so a stored choice in the shot browser can't leak in.

const ROOT = new URL('..', import.meta.url).pathname;

const wb = (product, theme) => ({ page: `workbench.html?product=${product}&theme=${theme}`, w: 1600, h: 1000 });
export const SHOTS = {
  'components-light': { page: 'components.html?theme=light', w: 1440, h: 1000, full: true },
  'components-dark': { page: 'components.html?theme=dark', w: 1440, h: 1000, full: true },
  'workbench-loom-light': wb('loom', 'light'),
  'workbench-loom-dark': wb('loom', 'dark'),
  'workbench-trace-light': wb('trace', 'light'),
  'workbench-trace-dark': wb('trace', 'dark'),
  'workbench-canvas-light': wb('canvas', 'light'),
  'workbench-canvas-dark': wb('canvas', 'dark'),
  'workbench-mesh-light': wb('mesh', 'light'),
  'workbench-mesh-dark': wb('mesh', 'dark'),
  'workbench-mesh-timeline-light': { page: 'workbench.html?product=mesh&theme=light&side=timeline&preview=1', w: 1600, h: 1000 },
  'workbench-loom-phone': { page: 'workbench.html?product=loom&theme=light', w: 400, h: 860 },
  'flow-upload-light': { page: 'flow.html?theme=light#upload', w: 1440, h: 1000 },
  'flow-datasheets-light': { page: 'flow.html?theme=light#datasheets', w: 1440, h: 1000 },
  'flow-datasheets-dark': { page: 'flow.html?theme=dark#datasheets', w: 1440, h: 1000 },
  'flow-review-light': { page: 'flow.html?theme=light#review', w: 1440, h: 1000 },
  'flow-phone-light': { page: 'flow.html?theme=light#datasheets', w: 400, h: 860 },
  'flow-phone-dark': { page: 'flow.html?theme=dark#datasheets', w: 400, h: 860 },
  'list-list-light': { page: 'list.html?theme=light#list', w: 1440, h: 1000 },
  'list-list-dark': { page: 'list.html?theme=dark#list', w: 1440, h: 1000 },
  'list-tiles-light': { page: 'list.html?theme=light#tiles', w: 1440, h: 1000 },
  'list-tiles-dark': { page: 'list.html?theme=dark#tiles', w: 1440, h: 1000 },
  'list-phone-light': { page: 'list.html?theme=light#list', w: 400, h: 860 },
  'settings-overview-light': { page: 'settings.html?theme=light#overview', w: 1440, h: 1000 },
  'settings-security-dark': { page: 'settings.html?theme=dark#security', w: 1440, h: 1000 },
};

export async function shoot(browser, only = Object.keys(SHOTS), base = 'http://127.0.0.1:8793/demo') {
  const done = [];
  for (const name of only) {
    const s = SHOTS[name];
    const tab = await browser.open({ name: 'style-shoot', viewport: { width: s.w, height: s.h } });
    await tab.run(async ({ page }) => { await page.setCacheEnabled(false); });
    await tab.goto(`${base}/${s.page}`);
    const state = await tab.evaluate(() => new Promise((res) => {
      const t0 = Date.now();
      (function poll() {
        if (window.__shotReady === true) return res({ ready: true });
        if (Date.now() - t0 > 20000) return res({ ready: false });
        setTimeout(poll, 50);
      })();
    }));
    await new Promise((r) => setTimeout(r, 300));
    const errors = (await tab.errors()).entries.map((e) => e.text || e.message || String(e));
    // Anything that 404s, and any request that leaves this server, is reported.
    const requests = await tab.requests();
    const failed = (Array.isArray(requests) ? requests : requests.entries ?? [])
      .filter((r) => r.status >= 400 || !r.url.startsWith(new URL(base).origin))
      .map((r) => `${r.status} ${r.url}`);
    const path = `${ROOT}demo/shots/${name}.png`;
    await tab.run(async ({ page }, p, full) => { await page.screenshot({ path: p, type: 'png', fullPage: !!full }); }, { args: [path, s.full] });
    done.push({ name, ...state, errors, failed });
    await browser.close({ name: 'style-shoot' });
  }
  return done;
}
