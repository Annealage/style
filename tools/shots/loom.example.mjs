// Shot table for Loom, as a worked example of the per-product table format
// (see "Checking a port" in the README). Start Loom without a backend:
//
//   .venv/bin/loom --design bridge_rectifier --backend none --no-open --port 18765
//
// then, from an omp JS eval cell:
//
//   const { shoot } = await import('/path/to/style/tools/shoot.mjs');
//   const table = (await import('/path/to/style/tools/shots/loom.example.mjs')).default;
//   await shoot(browser, { base: 'http://127.0.0.1:18765', shots: table.shots, allow: table.allow, out: '/tmp/loom-shots' });
//
// The project list needs `loom --projects DIR`; it is a separate run with its own base.

const clickNth = (selector, n) => async (tab) => {
  await tab.evaluate(`(() => { const e = document.querySelectorAll(${JSON.stringify(selector)})[${n}]; if (e) e.click(); })()`);
};

const viewTabs = [0, 1, 2].map((n) => ({
  name: `loom-view-${n}`,
  path: '/',
  ready: '#viewTabs button',
  state: clickNth('#viewTabs button', n),
}));

export default {
  shots: [
    { name: 'loom-workbench', path: '/', ready: '#viewTabs button' },
    ...viewTabs,
    {
      name: 'loom-settings',
      path: '/',
      ready: '#settingsBtn',
      state: async (tab) => {
        await tab.evaluate(() => document.getElementById('settingsBtn').click());
        await tab.waitForSelector('#settingsModal:not([hidden])', { timeout: 5000 });
      },
    },
    // At 400 wide the workbench collapses to the phone tab bar.
    { name: 'loom-phone-tabbar', path: '/', ready: '#tabbar', viewports: [[400, 860]] },
    // Board and 3D views need WebGL; skipped unless shoot() is given {webgl: true}.
    { name: 'loom-board', path: '/', webgl: true, ready: '#viewTabs button', state: clickNth('#viewTabs button', 2) },
  ],
  // Each entry carries the reason it is tolerated; a no-backend run refuses the agent socket.
  allow: [
    { match: /\/ws\b|websocket/i, reason: 'agent socket refuses with --backend none' },
  ],
};
