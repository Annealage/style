#!/usr/bin/env bash
# Move lib/style, the annealage style submodule, to another commit of style
# `main` and stage it. Copy this file to scripts/bump-style.sh in a product.
#
#   scripts/bump-style.sh [SHA-OR-TAG]
#
# The ref (default origin/main) is fetched into lib/style and checked out
# detached. It must be an ancestor of origin/main: style `main` is the only
# branch products pin from, so a local-only commit is refused. Every path in
# runtime-files.txt must exist at the new commit, except those listed in
# runtime-pending.txt (frame.js and palette.js until the library ships them).
# Nothing is committed.
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
sub=$repo/lib/style

die() { echo "bump-style: $*" >&2; exit 1; }

(($# <= 1)) || die "usage: scripts/bump-style.sh [SHA-OR-TAG]"
[[ -e $sub/.git ]] || die "lib/style is not checked out; run git submodule update --init lib/style"
[[ -z $(git -C "$sub" status --porcelain) ]] ||
    die "lib/style has changes of its own; make them in the style repo and bump to that commit"

old=$(git -C "$sub" rev-parse HEAD)
git -C "$sub" fetch -q origin main --tags
[[ -z ${1:-} ]] || git -C "$sub" fetch -q origin "$1" 2>/dev/null || true
sha=$(git -C "$sub" rev-parse --verify --quiet "${1:-origin/main}^{commit}") ||
    die "no commit ${1:-origin/main} in lib/style"
git -C "$sub" merge-base --is-ancestor "$sha" origin/main ||
    die "$sha is not on origin/main; push it to style main first"

git -C "$sub" checkout -q --detach "$sha"

missing=()
while IFS= read -r path; do
    [[ -n $path && $path != \#* ]] || continue
    [[ -e $sub/$path ]] && continue
    if [[ -f $sub/runtime-pending.txt ]] && grep -qxF "$path" "$sub/runtime-pending.txt"; then
        echo "bump-style: $path is pending in the library, skipped"
        continue
    fi
    missing+=("$path")
done <"$sub/runtime-files.txt"
if ((${#missing[@]})); then
    git -C "$sub" checkout -q --detach "$old"
    die "runtime-files.txt lists paths missing at $sha: ${missing[*]} (lib/style restored to $old)"
fi

git -C "$repo" add lib/style
echo "bump-style: lib/style ${old:0:9} -> ${sha:0:9}, staged"
git -C "$sub" log --oneline "$old..$sha" || true
