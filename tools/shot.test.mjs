// node --test tools/shot.test.mjs
// tools/shot against scratch pages: baselines, masks, readiness, refusal to bless a dirty report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { serveDir } from './lib/static-server.mjs';

const SHOT = new URL('./shot', import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), 'shot-test-'));
const site = join(work, 'site');
mkdirSync(site);
writeFileSync(join(site, 'ok.html'), '<!doctype html><title>ok</title><body><h1>Fixed</h1><div id="clock" style="font-size:80px"></div><script>document.getElementById("clock").textContent = String(Math.random()).slice(2, 10);</script>');
writeFileSync(join(site, 'plain.html'), '<!doctype html><title>plain</title><body><h1>Fixed</h1>');
writeFileSync(join(site, 'broken.html'), '<!doctype html><title>b</title><link rel="stylesheet" href="missing.css"><body><h1>Fixed</h1>');
const srv = await serveDir(site);

const table = (shots) => {
  const f = join(work, `table-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, `export default { shots: ${JSON.stringify(shots)}, allow: [] };`);
  return f;
};
const shot = (args) => new Promise((ok) => {
  const p = spawn(SHOT, args, { cwd: work });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => ok({ code, out }));
});
const base = [ '--base', srv.origin, '--concurrency', '1' ];
const one = (name, path, extra = {}) => ({ name, path, schemes: ['light'], viewports: [[500, 300]], ...extra });

test.after(async () => { await srv.close(); rmSync(work, { recursive: true }); });

test('a missing baseline fails with a message, update-baseline writes it, the next run passes', async () => {
  const t = table([one('plain', '/plain.html')]);
  const args = [...base, '--table', t, '--baseline', join(work, 'acc1'), '--out', join(work, 'out1')];
  let r = await shot(args);
  assert.equal(r.code, 1);
  assert.match(r.out, /BASELINE MISSING plain-light-500: no baseline PNG/);
  r = await shot([...args, '--update-baseline']);
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(work, 'acc1/plain-light-500.png')));
  r = await shot(args);
  assert.equal(r.code, 0, r.out);
});

test('a changed page fails and writes a diff image', async () => {
  const acc = join(work, 'acc2');
  const t1 = table([one('p', '/plain.html')]);
  await shot([...base, '--table', t1, '--baseline', acc, '--out', join(work, 'out2'), '--update-baseline']);
  const t3 = table([one('p', '/ok.html')]);
  const r = await shot([...base, '--table', t3, '--baseline', acc, '--out', join(work, 'out2b')]);
  assert.equal(r.code, 1);
  assert.match(r.out, /BASELINE (DIFF|SIZE) p-light-500/);
  assert.ok(existsSync(join(work, 'out2b/p-light-500.diff.png')));
});

test('a mask removes a clock from the diff', async () => {
  const acc = join(work, 'acc3');
  const masked = table([one('clk', '/ok.html', { mask: ['#clock'] })]);
  const unmasked = table([one('clk', '/ok.html')]);
  let r = await shot([...base, '--table', masked, '--baseline', acc, '--out', join(work, 'out3'), '--update-baseline']);
  assert.equal(r.code, 0, r.out);
  r = await shot([...base, '--table', masked, '--baseline', acc, '--out', join(work, 'out3')]);
  assert.equal(r.code, 0, r.out);
  r = await shot([...base, '--table', unmasked, '--baseline', acc, '--out', join(work, 'out3')]);
  assert.equal(r.code, 1, 'without the mask the random clock must fail the diff');
});

test('a page that does not settle reports not ready and does not hang', async () => {
  const t = table([one('never', '/plain.html', { ready: '#never-exists' })]);
  const t0 = Date.now();
  const r = await shot([...base, '--table', t, '--no-compare', '--out', join(work, 'out4'), '--ready-timeout', '600']);
  assert.equal(r.code, 1);
  assert.match(r.out, /NOT CLEAN never-light-500 \(not ready\)/);
  assert.ok(Date.now() - t0 < 15000);
});

test('--update-baseline refuses a dirty report and writes nothing', async () => {
  const t = table([one('broken', '/broken.html')]);
  const acc = join(work, 'acc5');
  const r = await shot([...base, '--table', t, '--baseline', acc, '--out', join(work, 'out5'), '--update-baseline']);
  assert.equal(r.code, 1);
  assert.match(r.out, /request: 404 .*missing\.css/);
  assert.match(r.out, /refusing --update-baseline/);
  assert.ok(!existsSync(acc) || readdirSync(acc).length === 0);
});

test('a loosened tolerance needs a reason; an unknown entry is a usage error', async () => {
  let r = await shot([...base, '--table', table([one('t', '/plain.html', { tolerance: 0.5 })]), '--no-compare']);
  assert.equal(r.code, 2);
  assert.match(r.out, /toleranceReason/);
  r = await shot([...base, '--table', table([one('t', '/plain.html')]), '--only', 'nope', '--no-compare']);
  assert.equal(r.code, 2);
});

test('a baseline no entry produces is reported, and update-baseline removes it', async () => {
  const acc = join(work, 'acc6');
  const t = table([one('keep', '/plain.html')]);
  const args = [...base, '--table', t, '--baseline', acc, '--out', join(work, 'out6')];
  await shot([...args, '--update-baseline']);
  const old = table([one('gone', '/plain.html')]);
  await shot([...base, '--table', old, '--baseline', acc, '--out', join(work, 'out6b'), '--update-baseline']);
  let r = await shot(args);
  assert.equal(r.code, 1);
  assert.match(r.out, /BASELINE ORPHAN.*gone-light-500\.png/);
  r = await shot([...args, '--update-baseline']);
  assert.equal(r.code, 0, r.out);
  r = await shot(args);
  assert.equal(r.code, 0, r.out);
});
