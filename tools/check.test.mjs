// node --test tools/check.test.mjs
// tools/check against scratch product trees: a clean one passes, each planted fault is found.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkTree } from './lib/check-rules.mjs';

const tree = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'check-'));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
};
const rulesIn = (root, o) => checkTree(root, o).findings.map((f) => `${f.file}:${f.line}:${f.rule}`).sort();

const CLEAN = {
  'static/page.html': '<!doctype html><html><head><link rel="stylesheet" href="/style/theme.css"></head><body><!-- confirm( and style="x" in a comment --><p class="hint">A plain sentence, with a hyphen - here.</p><a href="#add">add</a><script src="app.js"></script></body></html>',
  'static/app.css': '/* color: #ff0000; --panel */\n#add, #bad { color: var(--ink); background: var(--ground); font-family: var(--sans); }\n',
  'static/app.js': "// confirm('no') and \u2014 in a comment\nconst a = document.querySelector('#add');\nawait confirmRow(btn, { title: 'Delete' });\nel.style.left = '4px';\nconst s = 'a - b';\n",
  'lib/style/runtime-files.txt': 'tokens.css\n',
  'lib/style/tokens.css': ':root { --ink: #111; }\n',
};

test('a clean tree passes, vendored library and comments are not scanned', () => {
  const root = tree(CLEAN);
  try { assert.deepEqual(rulesIn(root), []); } finally { rmSync(root, { recursive: true }); }
});

test('planted faults are all found', () => {
  const root = tree({
    ...CLEAN,
    'static/bad.html': '<div style="color:red">x</div>\n<p>wait \u2014 here</p>\n<script>if (confirm("sure?")) go();</script>\n<button onclick="confirm(1)">b</button>\n',
    'static/bad.css': 'body { background: var(--panel); font-family: "Chivo", sans-serif; color: #ff00aa; }\n.x { --chrome: #fff; }\n',
    'static/bad.js': "const t = '<span style=\"a:b\">x</span>';\nwindow.confirm('x');\nconst m = 'one \u2014 two';\nctx.fillStyle = '#a1b2c3';\n",
  });
  try {
    const got = rulesIn(root);
    for (const want of [
      'static/bad.html:1:inline-style', 'static/bad.html:2:emdash', 'static/bad.html:3:confirm', 'static/bad.html:4:confirm',
      'static/bad.css:1:old-look', 'static/bad.css:1:hex', 'static/bad.css:2:old-look', 'static/bad.css:2:hex',
      'static/bad.js:1:inline-style', 'static/bad.js:2:confirm', 'static/bad.js:3:emdash', 'static/bad.js:4:hex',
    ]) assert.ok(got.includes(want), `${want} not in ${got.join(' ')}`);
    assert.equal(got.filter((f) => f.startsWith('static/app') || f.startsWith('static/page')).length, 0);
  } finally { rmSync(root, { recursive: true }); }
});

test('a directory with VENDORED.json is skipped like one with runtime-files.txt', () => {
  const root = tree({ ...CLEAN, 'static/style/VENDORED.json': '{}\n', 'static/style/x.css': 'a { color: #ff00aa; }\n' });
  try { assert.deepEqual(rulesIn(root), []); } finally { rmSync(root, { recursive: true }); }
});

test('check-ok skips a line; runtime-files names a missing path', () => {
  const root = tree({
    'a.css': '/* check-ok: brand colour from the logo file */\n.x { color: #112233; }\n',
    'lib/style/runtime-files.txt': 'tokens.css\nframe.js\n',
    'lib/style/frame.js': '',
  });
  try {
    const got = checkTree(root).findings;
    assert.deepEqual(got.map((f) => f.rule), ['runtime-files']);
    assert.match(got[0].message, /tokens\.css/);
  } finally { rmSync(root, { recursive: true }); }
});
