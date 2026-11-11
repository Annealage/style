import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { shoot, jobsOf, SHOTS_REFERENCE, DEFAULT_SCHEMES, DEFAULT_VIEWPORTS } from '../shoot.mjs';
import { launchBrowser } from './pw-browser.mjs';
import { serveDir } from './static-server.mjs';
import { compareFiles, DEFAULT_THRESHOLD, DEFAULT_TOLERANCE } from './diff.mjs';
import { loadConformance, collector, compareShot, derive, writeExpected } from './conform.mjs';

const STYLE = resolve(new URL('../..', import.meta.url).pathname);

const HELP = `tools/shot: headless shots, baseline diffs and structural conformance

  tools/shot [--table reference|<file.mjs>] [--preset full|smoke] [--base <url>]
             [--out <dir>] [--only <name>[,<name>]] [--baseline <dir>]
             [--conform] [--update-baseline] [--no-compare]
  tools/shot --derive-conformance

  --table      reference (the library's own pages, served by the tool; the default) or a
               table module whose default export is { shots, allow?, base?, baseline? }
  --preset     full: every entry, as the table defines it (the gate). smoke: one entry per
               page shape, light, desktop width only
  --base       URL of the running product (required for a product table)
  --out        where the PNGs, diffs and report go (default: ./shots/<date>, or a temp dir
               for the reference pages)
  --only       entry names, comma separated
  --baseline   accepted PNGs (default: demo/shots for reference, else the table's
               baseline, else ./shots/accepted)
  --conform    also compare computed style with tools/conformance.json
  --update-baseline  copy the shots to the baseline directory; refused unless every shot
               is clean; needs review of the PNGs first
  --no-compare shoot and report only, no baseline comparison
  --derive-conformance  rewrite tools/conformance.json 'expected' from the reference pages
  --ready-timeout <ms>  per-stage readiness limit (default 20000)
  --concurrency <n>     shots in flight (default 4 for the reference pages, 1 for a product:
               a product's own server may drop connections under parallel load)
  --threshold <0-1>     pixel colour distance (default ${DEFAULT_THRESHOLD})
  --tolerance <frac>    pixels allowed to differ (default ${DEFAULT_TOLERANCE}); a table entry may set its own
  --webgl      shoot entries marked webgl (the browser must supply WebGL)
  --executable <path>   Chromium to launch
  --json       print the result as JSON

Exit: 0 clean; 1 a shot is not clean, differs from its baseline or fails conformance; 2 usage or tool error.`;

class Usage extends Error {}

function parseArgs(argv) {
  const o = { table: 'reference', preset: 'full' };
  const val = (i, name) => { if (i + 1 >= argv.length) throw new Usage(`${name} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '--table': o.table = val(i++, a); break;
      case '--preset': o.preset = val(i++, a); break;
      case '--base': o.base = val(i++, a); break;
      case '--out': o.out = val(i++, a); break;
      case '--only': o.only = val(i++, a).split(',').filter(Boolean); break;
      case '--baseline': o.baseline = val(i++, a); break;
      case '--ready-timeout': o.readyTimeout = Number(val(i++, a)); break;
      case '--concurrency': o.concurrency = Number(val(i++, a)); break;
      case '--threshold': o.threshold = Number(val(i++, a)); break;
      case '--tolerance': o.tolerance = Number(val(i++, a)); break;
      case '--executable': o.executable = val(i++, a); break;
      case '--conform': o.conform = true; break;
      case '--update-baseline': o.update = true; break;
      case '--no-compare': o.noCompare = true; break;
      case '--derive-conformance': o.derive = true; break;
      case '--webgl': o.webgl = true; break;
      case '--json': o.json = true; break;
      default: throw new Usage(`unknown option ${a} (see --help)`);
    }
  }
  if (!['full', 'smoke'].includes(o.preset)) throw new Usage(`--preset is full or smoke, not ${o.preset}`);
  if (o.update && o.noCompare) throw new Usage('--update-baseline and --no-compare contradict');
  for (const k of ['readyTimeout', 'concurrency', 'threshold', 'tolerance']) {
    if (o[k] !== undefined && !Number.isFinite(o[k])) throw new Usage(`--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} needs a number`);
  }
  return o;
}

async function loadTable(spec) {
  if (spec === 'reference') return { shots: SHOTS_REFERENCE, allow: [], reference: true };
  const path = resolve(spec);
  if (!existsSync(path)) throw new Usage(`table not found: ${path}`);
  const mod = (await import(pathToFileURL(path).href)).default;
  const t = Array.isArray(mod) ? { shots: mod } : mod;
  if (!t || !Array.isArray(t.shots)) throw new Usage(`${path}: default export must be an array of entries or { shots: [...] }`);
  return { ...t, dir: dirname(path) };
}

// smoke: one entry per page shape (an entry with no shape is its own shape), shot in
// light at the first desktop viewport; webgl entries are left out.
export function applyPreset(entries, preset) {
  if (preset === 'full') return entries;
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    const shape = e.shape ?? e.name;
    if (e.webgl || seen.has(shape)) continue;
    if (!(e.schemes ?? DEFAULT_SCHEMES).includes('light')) continue;
    const vp = (e.viewports ?? DEFAULT_VIEWPORTS).find(([w]) => w >= 1000);
    if (!vp) continue;
    seen.add(shape);
    out.push({ ...e, schemes: ['light'], viewports: [vp] });
  }
  return out;
}

function checkTable(entries) {
  const names = new Set();
  for (const e of entries) {
    if (!e.name || !e.path) throw new Usage(`table entry needs name and path: ${JSON.stringify(e.name ?? e)}`);
    if (names.has(e.name)) throw new Usage(`table has two entries named ${e.name}`);
    names.add(e.name);
    if (e.tolerance !== undefined && !e.toleranceReason) throw new Usage(`entry ${e.name} sets tolerance without toleranceReason: say in the table why it is loosened`);
  }
}

const pngs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png') && !f.endsWith('.diff.png')) : []);

export async function main(argv) {
  let code;
  try { code = await run(parseArgs(argv)); } catch (e) {
    if (e instanceof Usage) { console.error(`tools/shot: ${e.message}`); code = 2; } else { console.error(`tools/shot: ${e.stack || e}`); code = 2; }
  }
  process.exit(code);
}

async function run(o) {
  if (o.help) { console.log(HELP); return 0; }
  const t0 = Date.now();
  const table = o.derive ? { shots: [], allow: [], reference: true } : await loadTable(o.table);
  checkTable(table.shots);
  const all = table.shots;
  const entries = applyPreset(o.only ? all.filter((e) => o.only.includes(e.name)) : all, o.preset);
  if (o.only) {
    const missing = o.only.filter((n) => !all.some((e) => e.name === n));
    if (missing.length) throw new Usage(`no such entry: ${missing.join(', ')}`);
  }

  let server;
  let browser;
  try {
    let base = o.base ?? table.base;
    if (table.reference) {
      if (!base) { server = await serveDir(STYLE); base = `${server.origin}/demo`; }
    } else if (!base) {
      throw new Usage('a product table needs --base <url> (the running product) or a `base` in the table');
    }
    browser = await launchBrowser({ executablePath: o.executable });

    if (o.derive) return await deriveConformance(browser, base, o);

    const out = resolve(o.out ?? (table.reference ? join(tmpdir(), 'style-shot-reference') : join('shots', new Date().toISOString().slice(0, 10))));
    mkdirSync(out, { recursive: true });
    for (const f of readdirSync(out)) if (f.endsWith('.diff.png')) rmSync(join(out, f)); // a diff from an earlier run is not evidence
    const baselineDir = resolve(o.baseline ?? (table.reference ? join(STYLE, 'demo/shots') : table.baseline ? resolve(table.dir, table.baseline) : 'shots/accepted'));

    const doc = o.conform ? loadConformance() : null;
    const result = await shoot(browser, {
      base, shots: entries, out, allow: table.allow, webgl: o.webgl, quiet: true,
      readyTimeout: o.readyTimeout, concurrency: o.concurrency ?? (table.reference ? 4 : 1), collect: doc ? collector(doc) : undefined,
    });
    const entryOf = new Map(entries.map((e) => [e.name, e]));
    const lines = [result.text];
    let failed = !result.ok;

    // Baseline comparison.
    const counts = { same: 0, changed: 0, missing: 0 };
    const toWrite = [];
    if (!o.noCompare) {
      for (const s of result.shots) {
        if (!s.file) continue;
        const e = entryOf.get(s.entry);
        const target = join(baselineDir, `${s.name}.png`);
        const cmp = compareFiles(s.file, target, {
          threshold: o.threshold ?? DEFAULT_THRESHOLD, tolerance: o.tolerance ?? e.tolerance ?? DEFAULT_TOLERANCE,
          diffPath: join(out, `${s.name}.diff.png`),
        });
        s.baseline = cmp;
        if (cmp.status === 'ok') { counts.same++; continue; }
        counts[cmp.status === 'missing' ? 'missing' : 'changed']++;
        toWrite.push({ from: s.file, to: target });
        if (!o.update) {
          lines.push(`BASELINE ${cmp.status.toUpperCase()} ${s.name}: ${cmp.message}`);
          if (cmp.status === 'diff') lines.push(`  diff image: ${join(out, `${s.name}.diff.png`)}`);
          failed = true;
        }
      }
      // A baseline that no entry produces is a renamed or removed shot: it must not linger.
      const fullRun = !o.only && o.preset === 'full';
      const orphans = fullRun ? pngs(baselineDir).filter((f) => !jobsOf(all).some((j) => `${j.file}.png` === f)) : [];
      if (orphans.length && !o.update) {
        lines.push(`BASELINE ORPHAN (no entry produces it; remove with --update-baseline): ${orphans.join(', ')}`);
        failed = true;
      }
      if (o.update) {
        if (!result.ok) {
          lines.push('refusing --update-baseline: the report is not clean (see NOT CLEAN above). A baseline is an accepted screen; fix the shots first.');
          return finish(o, result, lines, 1, t0);
        }
        mkdirSync(baselineDir, { recursive: true });
        for (const w of toWrite) copyFileSync(w.from, w.to);
        for (const f of orphans) rmSync(join(baselineDir, f));
        lines.push(`baseline ${baselineDir}: ${toWrite.length} written (${counts.missing} new, ${counts.changed} changed), ${counts.same} unchanged${orphans.length ? `, ${orphans.length} orphan removed` : ''}`);
      } else {
        lines.push(`baseline ${baselineDir}: ${counts.same} match, ${counts.changed} differ, ${counts.missing} missing`);
      }
    }

    // Structural conformance.
    if (doc) {
      let n = 0;
      for (const s of result.shots) {
        if (!s.collected || entryOf.get(s.entry).conform === false || !s.shape) continue;
        n++;
        s.conformance = compareShot(doc, s, entryOf.get(s.entry).conform);
        if (s.conformance.length) {
          failed = true;
          lines.push(`CONFORMANCE ${s.name} (${s.shape}, ${s.scheme}, ${s.w}):`);
          for (const d of s.conformance) lines.push(`  ${d.selector} ${d.prop}: expected ${d.expected}, got ${d.actual}`);
        }
      }
      lines.push(`conformance: ${n} shots checked against tools/conformance.json`);
    }
    return finish(o, result, lines, failed ? 1 : 0, t0);
  } finally {
    await browser?.shutdown();
    await server?.close();
  }
}

function finish(o, result, lines, code, t0) {
  lines.push(`${code === 0 ? 'PASS' : 'FAIL'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (o.json) {
    const slim = result.shots.map(({ collected, ...s }) => s);
    console.log(JSON.stringify({ ok: code === 0, shots: slim, stale: result.stale }, null, 2));
    console.error(lines.join('\n'));
  } else {
    console.log(lines.join('\n'));
  }
  return code;
}

async function deriveConformance(browser, base, o) {
  const doc = loadConformance();
  const run = async (entries, collect) => {
    const r = await shoot(browser, {
      base, shots: entries, out: join(tmpdir(), 'style-shot-derive'), screenshot: false, quiet: true,
      collect, concurrency: o.concurrency ?? 4, readyTimeout: o.readyTimeout,
    });
    return r.shots;
  };
  const expected = await derive(doc, run);
  writeExpected(expected);
  const n = Object.values(expected).reduce((a, v) => a + Object.keys(v).length, 0);
  console.log(`tools/conformance.json: expected values rewritten from ${base} (${Object.keys(doc.shapes).length} shapes, ${doc.products.length} products, ${n} groups). Review the diff, commit it with the library change.`);
  return 0;
}
