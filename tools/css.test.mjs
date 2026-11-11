// node --test tools/css.test.mjs
// The library's own stylesheets parse as intended: braces balance (a stray "}" makes the parser drop the
// next rule, which once took Loom's schematic and Mesh's canvas out of position), and a canvas in a
// .stage is positioned by theme.css.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { serveDir } from './lib/static-server.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FILES = ['tokens.css', 'theme.css', 'pages.css', 'demo/demo.css'];

// Strip comments and strings, then walk the braces: depth never goes below zero and ends at zero.
function check(text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, (m) => '"' + ' '.repeat(m.length - 2) + '"');
  let depth = 0;
  let line = 1;
  for (const ch of clean) {
    if (ch === '\n') line++;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth < 0) return { ok: false, why: `unmatched "}" at line ${line}` };
  }
  return depth === 0 ? { ok: true } : { ok: false, why: `${depth} unclosed "{" at the end` };
}

for (const f of FILES) {
  test(`${f}: braces balance and no top-level "}"`, () => {
    const r = check(readFileSync(`${ROOT}/${f}`, 'utf8'));
    assert.ok(r.ok, `${f}: ${r.why}`);
  });
}

test('the checker catches a stray brace', () => {
  assert.equal(check('a { color: red; }\n}\nb { color: blue; }').ok, false);
  assert.equal(check('@media (min-width: 1px) { a { color: red; } }').ok, true);
  assert.equal(check('/* } */ a { content: "}"; }').ok, true);
});

test('a <canvas> in a .stage is absolutely positioned over it', async () => {
  const srv = await serveDir(ROOT);
  const env = { ...process.env };
  delete env.DISPLAY;
  const pw = await chromium.launch({ headless: true, env });
  try {
    const page = await (await pw.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await page.goto(`${srv.origin}/demo/components.html`);
    const got = await page.evaluate(() => {
      const stage = document.createElement('div');
      stage.className = 'stage';
      const canvas = document.createElement('canvas');
      stage.appendChild(canvas);
      document.body.appendChild(stage);
      const cs = getComputedStyle(canvas);
      return { position: cs.position, display: cs.display, touchAction: cs.touchAction };
    });
    assert.deepEqual(got, { position: 'absolute', display: 'block', touchAction: 'none' });
  } finally {
    await pw.close();
    await srv.close();
  }
});
