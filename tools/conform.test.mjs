// node --test tools/conform.test.mjs
// compareShot with an entry-level `conform` override: what it excuses, what it still checks, what it refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareShot, loadConformance } from './lib/conform.mjs';
import { SHOTS_REFERENCE } from './shoot.mjs';

const doc = {
  tolerancePx: 1,
  phoneMaxWidth: 640,
  checks: [
    { id: 'wb', selector: '.wb', props: ['display', 'gridTemplateColumns'] },
    { id: 'vhead', selector: '.vhead', props: ['height', 'backgroundColor'] },
  ],
  tokens: [],
  productTokens: [],
  expected: {
    workbench: {
      desktop: { light: { checks: { wb: { display: 'grid', gridTemplateColumns: ['40px', null, '300px', '400px'] }, vhead: { height: '40px', backgroundColor: 'red' } }, tokens: {} } },
      phone: { light: { checks: { wb: { display: 'grid', gridTemplateColumns: ['40px', null] }, vhead: { height: '40px', backgroundColor: 'red' } }, tokens: {} } },
    },
  },
};
const read = (cols, vhead = { height: '40px', backgroundColor: 'red' }, w = 1600) => ({
  shape: 'workbench', scheme: 'light', w,
  collected: { product: null, tokens: {}, productTokens: {}, checks: { wb: { display: 'grid', gridTemplateColumns: cols }, vhead } },
});
const GRID = { '.wb': { gridTemplateColumns: ['40px', null, '0px', '400px'] } };

test('without an override a changed column fails', () => {
  const d = compareShot(doc, read('40px 1160px 0px 400px'));
  assert.deepEqual(d.map((x) => [x.selector, x.prop]), [['.wb', 'gridTemplateColumns']]);
});

test('expect replaces the shape value for that prop and asserts it', () => {
  const o = { reason: 'inspector closed', expect: { '.wb': GRID['.wb'] } };
  assert.deepEqual(compareShot(doc, read('40px 1160px 0px 400px'), o), []);
  const d = compareShot(doc, read('40px 1160px 10px 400px'), o);
  assert.equal(d.length, 1);
  assert.match(d[0].expected, /40px \* 0px 400px/);
});

test('an override does not excuse the rest of the shape', () => {
  const o = { reason: 'inspector closed', expect: GRID };
  const d = compareShot(doc, read('40px 1160px 0px 400px', { height: '44px', backgroundColor: 'red' }), o);
  assert.deepEqual(d.map((x) => [x.selector, x.prop]), [['.vhead', 'height']]);
});

test('expect absent: not drawn passes, drawn fails, and a missing element is not an error', () => {
  const o = { reason: 'phone tab', expect: { '.vhead': 'absent' } };
  assert.deepEqual(compareShot(doc, read('40px 300px', null, 400), o), []);
  const d = compareShot(doc, read('40px 300px', { height: '40px', backgroundColor: 'red' }, 400), o);
  assert.deepEqual(d.map((x) => [x.selector, x.prop, x.actual]), [['.vhead', '(element)', 'present']]);
  assert.equal(compareShot(doc, read('40px 300px', null, 400)).length, 1, 'without the override a missing .vhead fails');
});

test('except skips the listed props only', () => {
  const o = { reason: 'x', except: { '.vhead': ['height'] } };
  assert.deepEqual(compareShot(doc, read('40px 1160px 300px 400px', { height: '9px', backgroundColor: 'red' }), o), []);
  assert.equal(compareShot(doc, read('40px 1160px 300px 400px', { height: '9px', backgroundColor: 'blue' }), o).length, 1);
  assert.deepEqual(compareShot(doc, read('40px 1160px 300px 400px', null), { reason: 'x', except: { '.vhead': '*' } }), []);
});

test('a malformed override is reported, not ignored', () => {
  for (const o of [
    {}, { reason: ' ' }, { reason: 'x', bogus: 1 }, true,
    { reason: 'x', expect: { '.nope': 'absent' } },
    { reason: 'x', expect: { '.wb': { color: 'red' } } },
    { reason: 'x', except: { '.wb': ['color'] } },
    { reason: 'x', except: { '.wb': [] } },
  ]) {
    const d = compareShot(doc, read('40px 1160px 300px 400px'), o);
    assert.equal(d[0]?.selector, '(entry)', JSON.stringify(o));
  }
});

test('every override in the reference table is well formed', () => {
  const real = loadConformance();
  for (const e of SHOTS_REFERENCE) {
    if (!e.conform) continue;
    const s = { shape: 'workbench', scheme: 'light', w: 1600, collected: { product: null, tokens: {}, productTokens: {}, checks: {} } };
    const d = compareShot(real, s, e.conform);
    assert.notEqual(d[0]?.selector, '(entry)', `${e.name}: ${d[0]?.actual}`);
  }
});
