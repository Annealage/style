// Static conformance of a product tree: no browser. Each rule reports
// { file, line, rule, message }. A line carrying `check-ok` (with a reason) is skipped
// for every rule; the exceptions that live in data are in tools/conformance.json "check".
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep, basename } from 'node:path';
import { loadConformance } from './conform.mjs';

export const RULES = ['old-look', 'inline-style', 'hex', 'confirm', 'emdash', 'runtime-files'];

const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', '.tox', '.mypy_cache', '.pytest_cache', 'shots', 'playwright-report', 'test-results']);
const CSS = new Set(['.css']);
const MARKUP = new Set(['.html', '.htm', '.jinja', '.jinja2', '.j2', '.tpl', '.svelte', '.vue']);
const SCRIPT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const PY = new Set(['.py']);
const ext = (f) => { const i = f.lastIndexOf('.'); return i < 0 ? '' : f.slice(i).toLowerCase(); };

export function walk(root, { exclude = [] } = {}) {
  const out = [];
  const ex = exclude.map((p) => resolve(root, p));
  (function go(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (ex.includes(p)) continue;
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        // A directory that carries runtime-files.txt or VENDORED.json is the style library, vendored: it is checked by its own repo.
        if (p !== resolve(root) && (existsSync(join(p, 'runtime-files.txt')) || existsSync(join(p, 'VENDORED.json')))) continue;
        go(p);
      } else if (st.isFile() && st.size < 2_000_000 && !name.endsWith('.min.js')) {
        const e = ext(name);
        if (CSS.has(e) || MARKUP.has(e) || SCRIPT.has(e) || PY.has(e)) out.push(p);
      }
    }
  })(resolve(root));
  return out;
}

// Replace comments with spaces, keeping line breaks, so line numbers stay true.
const blank = (m) => m.replace(/[^\n]/g, ' ');
function stripComments(text, kind) {
  if (kind === 'css') return text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (kind === 'markup') {
    return text.replace(/<!--[\s\S]*?-->/g, blank).replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, b, c) => a + stripComments(b, 'css') + c)
      .replace(/(<script[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, b, c) => a + stripComments(b, 'script') + c);
  }
  if (kind === 'script') return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[\s;{}(),])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));
  if (kind === 'py') return text.replace(/(^|[^\\'"])#[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));
  return text;
}
const kindOf = (e) => (CSS.has(e) ? 'css' : MARKUP.has(e) ? 'markup' : SCRIPT.has(e) ? 'script' : 'py');

const OLD_TOKEN = /(var\(\s*|(?<![\w-]))(--(?:chrome|panel|view|rule-2|code|font|console-h))(?![\w-])/g;
const CHIVO = /chivo/i;
const INLINE_STYLE = /<[a-zA-Z][^<>]*?\sstyle\s*=/g;
const CONFIRM = /(?<![\w$.])(?:window\.|globalThis\.)?confirm\s*\(/g;
const HEX = '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\\w-])';
const EMDASH = /\u2014/;

function lineOf(text, index) {
  let n = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < index; i = text.indexOf('\n', i + 1)) n++;
  return n;
}

// Declarations of a stylesheet: [{ index, value }] for each `prop: value` inside a rule.
function* cssValues(text) {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') { depth++; start = i + 1; } else if (c === '}') { depth = Math.max(0, depth - 1); start = depth ? i + 1 : -1; } else if (c === ';' && depth && start >= 0) {
      yield { index: start, value: text.slice(start, i) };
      start = i + 1;
    }
  }
}

export function checkFile(file, root, cfg, rules) {
  const e = ext(file);
  const kind = kindOf(e);
  const raw = readFileSync(file, 'utf8');
  const rawLines = raw.split('\n');
  const rel = relative(root, file).split(sep).join('/');
  const text = stripComments(raw, kind);
  const findings = [];
  const add = (index, rule, message) => {
    const line = lineOf(text, index);
    if (/check-ok/.test(rawLines[line - 1] ?? '') || /check-ok/.test(rawLines[line - 2] ?? '')) return;
    findings.push({ file: rel, line, rule, message });
  };

  if (rules.has('old-look') && kind !== 'py') {
    for (const m of text.matchAll(OLD_TOKEN)) add(m.index, 'old-look', `old token ${m[2]} (see MIGRATION.md)`);
    for (const m of text.matchAll(/font-family[^;}\n]*/gi)) if (CHIVO.test(m[0])) add(m.index, 'old-look', 'Chivo font-family (the library font is Instrument Sans)');
    for (const m of text.matchAll(/@font-face[^}]*/gi)) if (CHIVO.test(m[0])) add(m.index, 'old-look', 'Chivo @font-face');
  }
  if (rules.has('inline-style') && kind !== 'css') {
    for (const m of text.matchAll(INLINE_STYLE)) add(m.index + m[0].lastIndexOf('style'), 'inline-style', 'inline style="" attribute (CSP: style-src \'self\')');
  }
  if (rules.has('hex') && !cfg.hexAllowFiles.includes(basename(file))) {
    const flag = (index, v) => { if (!cfg.hexAllowValues.includes(v.toLowerCase())) add(index, 'hex', `hex colour ${v}: use a token (var(--...))`); };
    const css = (body, base) => { for (const d of cssValues(body)) for (const m of d.value.matchAll(new RegExp(HEX, 'g'))) flag(base + d.index + m.index, m[0]); };
    if (kind === 'css') css(text, 0);
    else if (kind === 'markup') {
      for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css(m[1], m.index + m[0].indexOf('>') + 1);
    }
    if (kind === 'markup' || kind === 'script') {
      // A colour literal in markup or script; ids and anchors (#abc) are not colours.
      for (const m of text.matchAll(new RegExp(`(?<![\\w#&])(?<=["'\`:(,=\\s])${HEX}`, 'g'))) {
        const ls = text.lastIndexOf('\n', m.index) + 1;
        const line = text.slice(ls, text.indexOf('\n', m.index) < 0 ? undefined : text.indexOf('\n', m.index));
        if (/querySelector|getElementById|closest\(|matches\(|href|location|\.hash|\bid\b|for=|aria-|url\(#/.test(line) && !/(color|fill|stroke|background)/i.test(line)) continue;
        if (/data-[\w-]+\s*=\s*["']$/.test(text.slice(Math.max(0, m.index - 40), m.index))) continue;
        if (!/["'`]$/.test(text.slice(Math.max(0, m.index - 1), m.index)) && !/(color|fill|stroke|background|shadow)\s*[:=]/i.test(line)) continue;
        flag(m.index, m[0]);
      }
    }
  }
  if (rules.has('confirm') && (kind === 'script' || kind === 'markup')) {
    // In markup only code counts: <script> bodies and on*="" handlers, not prose.
    const code = kind === 'script' ? [[0, text]] : [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => [m.index + m[0].indexOf('>') + 1, m[1]])
      .concat([...text.matchAll(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi)].map((m) => [m.index, m[0]]));
    for (const [base, body] of code) {
      for (const m of body.matchAll(CONFIRM)) {
        if (/function\s+$/.test(body.slice(Math.max(0, m.index - 12), m.index))) continue;
        add(base + m.index, 'confirm', 'confirm(): use the in-page confirm row (confirm.js), rule 7');
      }
    }
  }
  if (rules.has('emdash')) {
    if (kind === 'markup' || kind === 'css') {
      for (const m of text.matchAll(/\u2014/g)) add(m.index, 'emdash', 'em dash in user-facing text (guide Words)');
    } else {
      for (const m of text.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
        const i = m[0].search(EMDASH);
        if (i >= 0) add(m.index + i, 'emdash', 'em dash in a string (guide Words)');
      }
    }
  }
  return findings;
}

// The vendored or neighbouring library's runtime list: every path must exist.
export function checkRuntimeFiles(styleDir, root) {
  const list = join(styleDir, 'runtime-files.txt');
  const rel = relative(root, styleDir) || '.';
  if (!existsSync(list)) return [{ file: rel, line: 0, rule: 'runtime-files', message: 'runtime-files.txt is missing' }];
  const pendingFile = join(styleDir, 'runtime-pending.txt');
  const pending = new Set(existsSync(pendingFile) ? readFileSync(pendingFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : []);
  const out = [];
  for (const p of readFileSync(list, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (pending.has(p) || existsSync(join(styleDir, p))) continue;
    out.push({ file: `${rel}/runtime-files.txt`, line: 0, rule: 'runtime-files', message: `${p} is listed but not present` });
  }
  return out;
}

export function checkTree(root, { rules = RULES, style, exclude = [] } = {}) {
  root = resolve(root);
  const cfg = loadConformance().check;
  const want = new Set(rules);
  const findings = [];
  const notes = [];
  const isStyleRepo = existsSync(join(root, 'runtime-files.txt'));
  const files = walk(root, { exclude: [...(cfg.exclude ?? []), ...(isStyleRepo ? cfg.styleRepoExclude ?? [] : []), ...exclude] });
  for (const f of files) findings.push(...checkFile(f, root, cfg, want));
  if (want.has('runtime-files')) {
    const dir = style ? resolve(style) : existsSync(join(root, 'runtime-files.txt')) ? root : existsSync(join(root, 'lib/style')) ? join(root, 'lib/style') : null;
    if (dir) findings.push(...checkRuntimeFiles(dir, root));
    else notes.push('runtime-files: no style library here (no lib/style, no runtime-files.txt, no --style); skipped');
  }
  return { findings, notes, files: files.length };
}
