// node --test tools/vendor-style.test.mjs
// tools/vendor-style.sh against a throwaway style repo with a bare origin: a full
// copy, a second run that changes nothing, a dropped file, --check against hand
// edits, the exclusion file, --dry-run and the refusals.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const SCRIPT = fs.readFileSync(new URL("./vendor-style.sh", import.meta.url), "utf8");

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}
function git(cwd, ...args) {
  const r = run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], cwd);
  assert.equal(r.code, 0, `git ${args.join(" ")}: ${r.out}`);
  return r.out.trim();
}
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// A style-like repo, cloned from a bare origin, with the script in tools/.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-style-"));
  const origin = path.join(root, "Annealage", "style.git");
  fs.mkdirSync(origin, { recursive: true });
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  const style = path.join(root, "style");
  git(root, "clone", "-q", origin, style);
  git(style, "checkout", "-q", "-b", "main");
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(style, rel)), { recursive: true });
    fs.writeFileSync(path.join(style, rel), text);
  };
  put("runtime-files.txt", "# what ships\ntokens.css\nfonts\nmarks\n");
  put("tokens.css", ":root{}\n");
  put("LICENSE", "licence\n");
  put("GUIDE.md", "guide\n");
  put("MIGRATION.md", "migration\n");
  put("demo/index.html", "demo\n");
  put("fonts/a.woff2", "font a");
  put("fonts/OFL-A.txt", "ofl a\n");
  put("marks/one.svg", "<svg>1</svg>\n");
  put("marks/two.svg", "<svg>2</svg>\n");
  put("tools/vendor-style.sh", SCRIPT);
  fs.chmodSync(path.join(style, "tools/vendor-style.sh"), 0o755);
  git(style, "add", "-A");
  git(style, "commit", "-q", "-m", "first");
  git(style, "push", "-q", "origin", "main");
  const dest = path.join(root, "product", "lib", "style");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  return {
    root, style, dest, origin,
    put,
    sh: (...args) => run(path.join(style, "tools/vendor-style.sh"), args, root),
    commit(msg, { push = true } = {}) {
      git(style, "add", "-A");
      git(style, "commit", "-q", "-m", msg);
      if (push) git(style, "push", "-q", "origin", "main");
      return git(style, "rev-parse", "HEAD");
    },
    head: () => git(style, "rev-parse", "HEAD"),
  };
}
function tree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p, "utf8");
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}
const manifest = (dest) => JSON.parse(fs.readFileSync(path.join(dest, "VENDORED.json"), "utf8"));

test("a full copy: exactly the runtime files, licences, and a manifest", () => {
  const f = fixture();
  const r = f.sh(f.dest);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(Object.keys(tree(f.dest)).sort(), [
    "LICENSE", "VENDORED.json", "fonts/OFL-A.txt", "fonts/a.woff2",
    "marks/one.svg", "marks/two.svg", "tokens.css",
  ]);
  const m = manifest(f.dest);
  assert.equal(m.source, "Annealage/style");
  assert.equal(m.commit, f.head());
  assert.match(m.date, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.deepEqual(m.files.map((x) => x.path), Object.keys(tree(f.dest)).filter((p) => p !== "VENDORED.json").sort());
  for (const x of m.files) assert.equal(x.sha256, sha256(path.join(f.dest, x.path)), x.path);
  assert.equal(f.sh(f.dest, "--check").code, 0);
});

test("a second run changes nothing, not even mtimes", () => {
  const f = fixture();
  assert.equal(f.sh(f.dest).code, 0);
  const before = tree(f.dest);
  const mt = (p) => fs.statSync(path.join(f.dest, p)).mtimeMs;
  const times = Object.fromEntries(Object.keys(before).map((p) => [p, mt(p)]));
  const r = f.sh(f.dest);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(tree(f.dest), before);
  for (const p of Object.keys(before)) assert.equal(mt(p), times[p], p);
  assert.match(r.out, /0 added, 0 updated, 0 removed, 6 unchanged/);
});

test("an updated file is rewritten and a dropped one is deleted with its empty directory", () => {
  const f = fixture();
  f.sh(f.dest);
  f.put("tokens.css", ":root{--a:1}\n");
  fs.rmSync(path.join(f.style, "marks/two.svg"));
  f.commit("update, drop two");
  let r = f.sh(f.dest);
  assert.equal(r.code, 0, r.out);
  assert.equal(fs.readFileSync(path.join(f.dest, "tokens.css"), "utf8"), ":root{--a:1}\n");
  assert.ok(!fs.existsSync(path.join(f.dest, "marks/two.svg")));
  assert.ok(fs.existsSync(path.join(f.dest, "marks/one.svg")));
  assert.match(r.out, /1 updated, 1 removed/);
  // Dropping the whole directory from the list removes the directory.
  f.put("runtime-files.txt", "tokens.css\nfonts\n");
  f.commit("drop marks");
  r = f.sh(f.dest);
  assert.equal(r.code, 0, r.out);
  assert.ok(!fs.existsSync(path.join(f.dest, "marks")));
  assert.deepEqual(manifest(f.dest).files.map((x) => x.path), ["LICENSE", "fonts/OFL-A.txt", "fonts/a.woff2", "tokens.css"]);
  // A file of the product's own beside the vendored ones survives a run.
  fs.writeFileSync(path.join(f.dest, "mine.txt"), "mine");
  assert.equal(f.sh(f.dest).code, 0);
  assert.ok(fs.existsSync(path.join(f.dest, "mine.txt")));
});

test("--check catches a hand edit, a missing file, an added file and a doctored manifest", () => {
  const f = fixture();
  f.sh(f.dest);
  assert.equal(f.sh(f.dest, "--check").code, 0);

  fs.appendFileSync(path.join(f.dest, "tokens.css"), "/* mine */\n");
  let r = f.sh(f.dest, "--check");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /tokens\.css was edited/);
  f.sh(f.dest); // a run puts it back
  assert.equal(f.sh(f.dest, "--check").code, 0);

  fs.rmSync(path.join(f.dest, "marks/one.svg"));
  r = f.sh(f.dest, "--check");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /marks\/one\.svg is missing/);
  f.sh(f.dest);

  fs.writeFileSync(path.join(f.dest, "extra.css"), "x");
  r = f.sh(f.dest, "--check");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /extra\.css was added by hand/);
  fs.rmSync(path.join(f.dest, "extra.css"));

  // Edit the file and the manifest together: the blob at the commit still disagrees.
  const file = path.join(f.dest, "tokens.css");
  fs.writeFileSync(file, "forged\n");
  const mfile = path.join(f.dest, "VENDORED.json");
  const m = manifest(f.dest);
  m.files.find((x) => x.path === "tokens.css").sha256 = sha256(file);
  fs.writeFileSync(mfile, JSON.stringify(m, null, 2));
  r = f.sh(f.dest, "--check");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /does not match the blob/);
});

test("--check needs the commit on origin/main, and with --ref the same commit", () => {
  const f = fixture();
  const first = f.head();
  f.sh(f.dest);
  assert.equal(f.sh(f.dest, "--check", "--ref", first).code, 0);
  f.put("tokens.css", ":root{--b:2}\n");
  const second = f.commit("second");
  assert.equal(f.sh(f.dest, "--check").code, 0);
  const r = f.sh(f.dest, "--check", "--ref", second);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /not /);
  // A manifest naming a commit the checkout has never heard of.
  const m = manifest(f.dest);
  m.commit = "0123456789012345678901234567890123456789";
  fs.writeFileSync(path.join(f.dest, "VENDORED.json"), JSON.stringify(m, null, 2));
  const r2 = f.sh(f.dest, "--check");
  assert.notEqual(r2.code, 0);
  assert.match(r2.out, /not in the style checkout/);
});

test("--ref vendors an older commit; a commit not on origin/main is refused", () => {
  const f = fixture();
  const first = f.head();
  f.put("tokens.css", ":root{--new:1}\n");
  f.commit("second");
  let r = f.sh(f.dest, "--ref", first);
  assert.equal(r.code, 0, r.out);
  assert.equal(manifest(f.dest).commit, first);
  assert.equal(fs.readFileSync(path.join(f.dest, "tokens.css"), "utf8"), ":root{}\n");

  f.put("tokens.css", ":root{--local:1}\n");
  const local = f.commit("local only", { push: false });
  const other = path.join(f.root, "other");
  r = f.sh(other, "--ref", local);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /not on origin\/main/);
  assert.ok(!fs.existsSync(other), "a refused run leaves no destination");
  r = f.sh(other);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /not on origin\/main/);
});

test("a dirty style checkout is refused", () => {
  const f = fixture();
  fs.appendFileSync(path.join(f.style, "tokens.css"), "/* wip */\n");
  let r = f.sh(f.dest);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /changes of its own/);
  assert.deepEqual(tree(f.dest), {});
  git(f.style, "checkout", "--", "tokens.css");
  fs.writeFileSync(path.join(f.style, "untracked.txt"), "x");
  r = f.sh(f.dest);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /changes of its own/);
});

test("vendor-style.exclude beside the destination leaves paths out", () => {
  const f = fixture();
  fs.writeFileSync(
    path.join(f.root, "product", "lib", "vendor-style.exclude"),
    "# marks we do not use\nmarks/two.svg\n\n  fonts/OFL-A.txt  # trailing\nnothing/here\n",
  );
  const r = f.sh(f.dest);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /nothing\/here matches nothing/);
  assert.deepEqual(Object.keys(tree(f.dest)).sort(), [
    "LICENSE", "VENDORED.json", "fonts/a.woff2", "marks/one.svg", "tokens.css",
  ]);
  // A whole directory, and a file excluded after it was vendored is removed.
  fs.writeFileSync(path.join(f.root, "product", "lib", "vendor-style.exclude"), "marks\nfonts\n");
  assert.equal(f.sh(f.dest).code, 0);
  assert.deepEqual(Object.keys(tree(f.dest)).sort(), ["LICENSE", "VENDORED.json", "tokens.css"]);
});

test("--dry-run prints the plan and writes nothing", () => {
  const f = fixture();
  let r = f.sh(f.dest, "--dry-run");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /add tokens\.css/);
  assert.match(r.out, /add fonts\/OFL-A\.txt/);
  assert.doesNotMatch(r.out, /demo|GUIDE|MIGRATION|tools/);
  assert.deepEqual(tree(f.dest), {});
  f.sh(f.dest);
  f.put("tokens.css", ":root{--c:3}\n");
  fs.rmSync(path.join(f.style, "marks/two.svg"));
  f.commit("change");
  const before = tree(f.dest);
  r = f.sh(f.dest, "--dry-run");
  assert.match(r.out, /update tokens\.css/);
  assert.match(r.out, /remove marks\/two\.svg/);
  assert.deepEqual(tree(f.dest), before);
});

test("a runtime list naming docs, demo or tools, or a missing path, is refused", () => {
  for (const [line, re] of [
    ["GUIDE.md", /never vendored/],
    ["demo", /never vendored/],
    ["tools/vendor-style.sh", /never vendored/],
    ["nothing.css", /missing at/],
  ]) {
    const f = fixture();
    f.put("runtime-files.txt", `tokens.css\n${line}\n`);
    f.commit("bad list");
    const r = f.sh(f.dest);
    assert.notEqual(r.code, 0, line);
    assert.match(r.out, re, line);
    assert.ok(!fs.existsSync(path.join(f.dest, "VENDORED.json")), line);
  }
});

test("--check does not care that the style checkout's HEAD is unpushed", () => {
  const f = fixture();
  f.sh(f.dest);
  f.put("tokens.css", ":root{--local:1}\n");
  f.commit("local only", { push: false });
  const r = f.sh(f.dest, "--check");
  assert.equal(r.code, 0, r.out);
});
