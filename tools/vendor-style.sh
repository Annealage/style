#!/usr/bin/env bash
# Copy the files a product ships out of this style checkout into a product's own
# tree, for a product whose source is public and so cannot pin the private style
# repo as a submodule. Run it from the style checkout; it is not a template.
#
#   tools/vendor-style.sh <dest-dir> [--ref SHA] [--check] [--dry-run]
#
# Vendor: reads runtime-files.txt at the ref (default HEAD) and copies exactly
# those paths (a directory is every file under it) into <dest-dir>, with LICENSE
# and the OFL-*.txt beside the fonts. Files a previous run vendored that are no
# longer listed are deleted. <dest-dir>/VENDORED.json records the source repo,
# the commit, the commit's date (UTC, so a second run changes nothing) and the
# sha256 of every file; it is also the manifest the next run removes by. The
# style checkout must be clean, and the ref must be an ancestor of origin/main
# (origin/main is fetched first when it can be). Nothing is committed.
#
# <dest-dir>/../vendor-style.exclude, if present, lists paths to leave out, one
# per line (a file or a directory; blank lines and # comments ignored).
#
# --check: no writes, no network. Fails if a vendored file was edited, removed
# or added by hand, if VENDORED.json disagrees with the blob at its commit, or if
# that commit is not an ancestor of the local origin/main. With --ref it also
# fails unless the destination was vendored from exactly that commit.
# --dry-run: print what a run would do and change nothing.
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

die() { echo "vendor-style: $*" >&2; exit 1; }
usage() { echo "usage: tools/vendor-style.sh <dest-dir> [--ref SHA] [--check] [--dry-run]"; }

dest= ref= check=0 dry=0
while (($#)); do
    case $1 in
        --ref) (($# >= 2)) || die "--ref needs a value"; ref=$2; shift 2 ;;
        --ref=*) ref=${1#--ref=}; shift ;;
        --check) check=1; shift ;;
        --dry-run) dry=1; shift ;;
        -h | --help) usage; exit 0 ;;
        -*) usage >&2; die "unknown option $1" ;;
        *) [[ -z $dest ]] || { usage >&2; die "one destination only"; }; dest=$1; shift ;;
    esac
done
[[ -n $dest ]] || { usage >&2; exit 1; }
((! check || ! dry)) || die "--check and --dry-run do not combine"

sha() {
    if command -v sha256sum >/dev/null; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi
}
git_() { git -C "$repo" "$@"; }

# Destination, absolute.
dest=${dest%/}
if [[ -d $dest ]]; then
    dest=$(cd "$dest" && pwd)
else
    ((! check)) || die "$dest does not exist"
    case $dest in /*) ;; *) dest=$PWD/$dest ;; esac
fi
[[ $dest != "$repo" && $dest != "$repo"/* ]] || die "the destination is inside the style checkout"

git_ rev-parse --verify --quiet origin/main >/dev/null || die "the style checkout has no origin/main"
((check)) || git_ fetch -q origin main 2>/dev/null || true
if [[ -n $ref ]] && ((! check)); then
    git_ rev-parse --verify --quiet "$ref^{commit}" >/dev/null || git_ fetch -q origin "$ref" 2>/dev/null || true
fi
sha_=
if [[ -n $ref ]] || ((! check)); then
    sha_=$(git_ rev-parse --verify --quiet "${ref:-HEAD}^{commit}") || die "no commit ${ref:-HEAD} in the style checkout"
    git_ merge-base --is-ancestor "$sha_" origin/main ||
        die "$sha_ is not on origin/main; push it to style main first (or git fetch)"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# The manifest of the destination: "path sha256" lines, and its commit.
manifest=$dest/VENDORED.json
read_manifest() {
    : >"$tmp/old"
    old_commit=
    [[ -f $manifest ]] || return 0
    tr -d '\n' <"$manifest" | grep -o '{ *"path": *"[^"]*", *"sha256": *"[0-9a-f]*" *}' |
        sed 's/^{ *"path": *"\([^"]*\)", *"sha256": *"\([0-9a-f]*\)" *}$/\1 \2/' | LC_ALL=C sort >"$tmp/old" || true
    old_commit=$(tr -d '\n' <"$manifest" | grep -o '"commit": *"[0-9a-f]*"' | sed 's/.*"\([0-9a-f]*\)"$/\1/' || true)
    while read -r p _; do
        [[ $p != /* && $p != *..* ]] || die "$manifest lists an unsafe path: $p"
    done <"$tmp/old"
}

if ((check)); then
    [[ -f $manifest ]] || die "$manifest is missing; nothing was vendored here"
    read_manifest
    problems=0
    bad() { echo "vendor-style: $*" >&2; problems=$((problems + 1)); }
    [[ -s $tmp/old ]] || bad "VENDORED.json lists no files"

    if [[ -z $old_commit ]] || ! git_ cat-file -e "$old_commit^{commit}" 2>/dev/null; then
        bad "commit ${old_commit:-?} is not in the style checkout (git fetch)"
    else
        git_ merge-base --is-ancestor "$old_commit" origin/main ||
            bad "commit $old_commit is not an ancestor of origin/main"
        [[ -z $ref || $old_commit == "$sha_" ]] ||
            bad "vendored from ${old_commit:0:9}, not ${sha_:0:9}"
    fi
    have_commit=0
    [[ -n $old_commit ]] && git_ cat-file -e "$old_commit^{commit}" 2>/dev/null && have_commit=1

    while read -r p h; do
        if [[ ! -f $dest/$p ]]; then bad "$p is missing"; continue; fi
        [[ $(sha <"$dest/$p") == "$h" ]] || bad "$p was edited"
        if ((have_commit)); then
            [[ $(git_ cat-file blob "$old_commit:$p" 2>/dev/null | sha) == "$h" ]] ||
                bad "$p: VENDORED.json does not match the blob at ${old_commit:0:9}"
        fi
    done <"$tmp/old"
    (cd "$dest" && find . -type f ! -path ./VENDORED.json | sed 's#^\./##' | LC_ALL=C sort) >"$tmp/have"
    cut -d' ' -f1 "$tmp/old" >"$tmp/listed"
    while IFS= read -r p; do bad "$p was added by hand"; done < <(LC_ALL=C comm -23 "$tmp/have" "$tmp/listed")
    ((problems == 0)) || die "$dest drifts from the library ($problems problems)"
    echo "vendor-style: $dest matches ${old_commit:0:9}"
    exit 0
fi

[[ -z $(git_ status --porcelain) ]] ||
    die "the style checkout has changes of its own; commit them to style main and vendor from that"

read_manifest

# Exclusions.
: >"$tmp/exclude"
excl=$(dirname "$dest")/vendor-style.exclude
if [[ -f $excl ]]; then
    while IFS= read -r line; do
        line=${line%%#*}
        line=${line#"${line%%[![:space:]]*}"}
        line=${line%"${line##*[![:space:]]}"}
        line=${line#./}
        line=${line%/}
        [[ -n $line ]] && echo "$line" >>"$tmp/exclude"
    done <"$excl"
fi
excluded() {
    local e
    while IFS= read -r e; do
        [[ $1 == "$e" || $1 == "$e"/* ]] && return 0
    done <"$tmp/exclude"
    return 1
}

# Paths to vendor: runtime-files.txt at the ref, directories expanded.
: >"$tmp/all"
git_ cat-file blob "$sha_:runtime-files.txt" >"$tmp/runtime" 2>/dev/null || die "no runtime-files.txt at ${sha_:0:9}"
while IFS= read -r entry; do
    [[ -n $entry && $entry != \#* ]] || continue
    entry=${entry%/}
    case $entry in
        . | .. | */../* | ../* | */.. | /*) die "runtime-files.txt lists an unusable path: $entry" ;;
        demo | demo/* | tools | tools/* | *.md) die "runtime-files.txt lists $entry, which is never vendored" ;;
    esac
    found=$(git_ ls-tree -r --name-only "$sha_" -- "$entry")
    [[ -n $found ]] || die "runtime-files.txt lists $entry, missing at ${sha_:0:9}"
    echo "$found" >>"$tmp/all"
done <"$tmp/runtime"
# The licence of the library, and of every font family shipped.
git_ cat-file -e "$sha_:LICENSE" 2>/dev/null || die "no LICENSE at ${sha_:0:9}"
echo LICENSE >>"$tmp/all"
LC_ALL=C sort -u "$tmp/all" -o "$tmp/all"
while IFS= read -r p; do
    case $p in
        *.woff | *.woff2 | *.ttf | *.otf)
            d=$(dirname "$p"); [[ $d == . ]] && d=
            if [[ -n $d ]]; then found=$(git_ ls-tree --name-only "$sha_" -- "$d/"); else found=$(git_ ls-tree --name-only "$sha_"); fi
            grep -E '(^|/)OFL-[^/]*\.txt$' <<<"$found" >>"$tmp/all" || true ;;
    esac
done <"$tmp/all"
LC_ALL=C sort -u "$tmp/all" -o "$tmp/all"

: >"$tmp/new"
while IFS= read -r p; do
    [[ $p == LICENSE ]] || ! excluded "$p" || continue
    [[ $p != *[[:space:]\"\\]* ]] || die "$p has a character VENDORED.json cannot hold"
    echo "$p $(git_ cat-file blob "$sha_:$p" | sha)" >>"$tmp/new"
done <"$tmp/all"
while IFS= read -r e; do
    matched=0
    while IFS= read -r p; do
        [[ $p == "$e" || $p == "$e"/* ]] && { matched=1; break; }
    done <"$tmp/all"
    ((matched)) || echo "vendor-style: $excl: $e matches nothing" >&2
done <"$tmp/exclude"

# Plan.
cut -d' ' -f1 "$tmp/new" >"$tmp/newpaths"
cut -d' ' -f1 "$tmp/old" >"$tmp/oldpaths"
LC_ALL=C comm -13 "$tmp/newpaths" "$tmp/oldpaths" >"$tmp/gone"
added=0 changed=0 same=0 removed=0
: >"$tmp/todo"
while read -r p h; do
    if [[ ! -f $dest/$p ]]; then
        echo "add $p" >>"$tmp/plan"; echo "$p" >>"$tmp/todo"; added=$((added + 1))
    elif [[ $(sha <"$dest/$p") != "$h" ]]; then
        echo "update $p" >>"$tmp/plan"; echo "$p" >>"$tmp/todo"; changed=$((changed + 1))
    else
        same=$((same + 1))
    fi
done <"$tmp/new"
while IFS= read -r p; do
    [[ -f $dest/$p ]] && { echo "remove $p" >>"$tmp/plan"; removed=$((removed + 1)); }
done <"$tmp/gone"
: >>"$tmp/plan"

date_=$(TZ=UTC git_ show -s --date=format-local:%Y-%m-%dT%H:%M:%SZ --format=%cd "$sha_")
origin=$(git_ remote get-url origin)
origin=${origin%.git}
name=${origin##*[:/]}
owner=${origin%/*}; owner=${owner##*[:/]}
source_=${owner:+$owner/}$name
{
    echo "{"
    echo "  \"source\": \"$source_\","
    echo "  \"commit\": \"$sha_\","
    echo "  \"date\": \"$date_\","
    echo "  \"files\": ["
    sed 's/^\(.*\) \(.*\)$/    {"path": "\1", "sha256": "\2"}/; $!s/$/,/' "$tmp/new"
    echo "  ]"
    echo "}"
} >"$tmp/manifest"
manifest_changes=1
[[ -f $manifest ]] && cmp -s "$tmp/manifest" "$manifest" && manifest_changes=0

if ((dry)); then
    echo "vendor-style: would vendor $source_ ${sha_:0:9} into $dest"
    sed 's/^/  /' "$tmp/plan"
    echo "  $same unchanged, VENDORED.json $( ((manifest_changes)) && echo rewritten || echo unchanged)"
    exit 0
fi

mkdir -p "$dest"
while IFS= read -r p; do
    mkdir -p "$dest/$(dirname "$p")"
    git_ cat-file blob "$sha_:$p" >"$dest/$p"
done <"$tmp/todo"
while IFS= read -r p; do
    [[ -f $dest/$p ]] || continue
    rm -f "$dest/$p"
    d=$(dirname "$p")
    while [[ $d != . ]]; do rmdir "$dest/$d" 2>/dev/null || break; d=$(dirname "$d"); done
done <"$tmp/gone"
((! manifest_changes)) || cp "$tmp/manifest" "$manifest"

sed 's/^/  /' "$tmp/plan"
echo "vendor-style: $dest <- ${sha_:0:9}: $added added, $changed updated, $removed removed, $same unchanged"
