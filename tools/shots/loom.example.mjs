// Shot table for Loom, as a worked example of the per-product table format
// (see "Checking a port" in the README). Start Loom without a backend:
//
//   .venv/bin/loom --design bridge_rectifier --backend none --no-open --port 18765
//
// then either from the command line (headless, Playwright):
//
//   tools/shot --table tools/shots/loom.example.mjs --base http://127.0.0.1:18765 --out /tmp/loom-shots --conform --no-compare
//
// or from an omp JS eval cell:
//
//   const { shoot } = await import('/path/to/style/tools/shoot.mjs');
//   const table = (await import('/path/to/style/tools/shots/loom.example.mjs')).default;
//   await shoot(browser, { base: 'http://127.0.0.1:18765', shots: table.shots, allow: table.allow, out: '/tmp/loom-shots' });
//
// `shape` picks the structural expectations in tools/conformance.json and lets the
// smoke preset take one entry per shape. `baseline` is where accepted PNGs live
// (relative to this file) for tools/shot's pixel comparison.
//
// The project list needs `loom --projects DIR`; it is a separate run with its own base.

const clickNth = (selector, n) => async (tab) => {
  await tab.evaluate(`(() => { const e = document.querySelectorAll(${JSON.stringify(selector)})[${n}]; if (e) e.click(); })()`);
};

const viewTabs = [0, 1, 2].map((n) => ({
  name: `loom-view-${n}`,
  path: '/',
  shape: 'workbench',
  ready: '#viewTabs button',
  state: clickNth('#viewTabs button', n),
}));

export default {
  baseline: '../../shots/accepted', // an unported example: nothing is accepted yet
  shots: [
    { name: 'loom-workbench', path: '/', shape: 'workbench', ready: '#viewTabs button' },
    ...viewTabs,
    {
      name: 'loom-settings',
      path: '/',
      shape: 'workbench',
      ready: '#settingsBtn',
      state: async (tab) => {
        await tab.evaluate(() => document.getElementById('settingsBtn').click());
        await tab.waitForSelector('#settingsModal:not([hidden])', { timeout: 5000 });
      },
    },
    // At 400 wide the workbench collapses to the phone tab bar.
    { name: 'loom-phone-tabbar', path: '/', shape: 'workbench', ready: '#tabbar', viewports: [[400, 860]] },
    // Board and 3D views need WebGL; skipped unless shoot() is given {webgl: true}.
    { name: 'loom-board', path: '/', shape: 'workbench', webgl: true, ready: '#viewTabs button', state: clickNth('#viewTabs button', 2) },
  ],
  // Each entry carries the reason it is tolerated; a no-backend run refuses the agent socket.
  allow: [
    { match: /\/ws\b|websocket/i, reason: 'agent socket refuses with --backend none' },
    // A headless browser has no login link, so Loom's browser-token auth refuses its API reads.
    { match: /\b403\b.*\/(whoami|review|settings|api\/(build|requirements|board|circuit))\b/, reason: 'no browser-token login in a headless run' },
    { match: /\b404\b.*\/api\/(project\/title-block|workflow)/, reason: 'no project or agent workflow with --backend none' },
  ],
};
