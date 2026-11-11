import { existsSync } from 'node:fs';
import { checkTree, RULES } from './check-rules.mjs';

const HELP = `tools/check [dir] [--style <dir>] [--rules a,b] [--exclude <path>] [--json]

Static conformance of a product tree, no browser. dir defaults to the current directory.
Rules: ${RULES.join(', ')}.
  old-look       old tokens (--chrome --panel --view --rule-2 --code --font --console-h) and Chivo
  inline-style   style="" attributes in markup, templates and markup built in scripts
  hex            hex colours outside tools/conformance.json "check" exceptions
  confirm        confirm() calls (use confirm.js)
  emdash         an em dash in a string or in markup text
  runtime-files  every path in runtime-files.txt exists (the library is --style, lib/style or dir)
A line, or the line above, carrying 'check-ok' and a reason is skipped.
Exit: 0 clean; 1 findings; 2 usage error.`;

export function main(argv) {
  const o = { dir: '.', rules: RULES, exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) { console.error(`tools/check: ${a} needs a value`); process.exit(2); } return argv[++i]; };
    if (a === '-h' || a === '--help') { console.log(HELP); return process.exit(0); }
    else if (a === '--style') o.style = val();
    else if (a === '--rules') o.rules = val().split(',').filter(Boolean);
    else if (a === '--exclude') o.exclude.push(val());
    else if (a === '--json') o.json = true;
    else if (a.startsWith('-')) { console.error(`tools/check: unknown option ${a}`); process.exit(2); }
    else o.dir = a;
  }
  const bad = o.rules.filter((r) => !RULES.includes(r));
  if (bad.length) { console.error(`tools/check: unknown rule ${bad.join(', ')}`); process.exit(2); }
  if (!existsSync(o.dir)) { console.error(`tools/check: no such directory ${o.dir}`); process.exit(2); }

  const { findings, notes, files } = checkTree(o.dir, o);
  if (o.json) {
    console.log(JSON.stringify({ ok: findings.length === 0, files, findings, notes }, null, 2));
  } else {
    for (const f of findings) console.log(`${f.file}${f.line ? `:${f.line}` : ''}: [${f.rule}] ${f.message}`);
    for (const n of notes) console.log(`note: ${n}`);
    console.log(findings.length ? `FAIL: ${findings.length} finding(s) in ${files} files` : `PASS: ${files} files clean`);
  }
  process.exit(findings.length ? 1 : 0);
}
