// Pixel comparison of a shot with its accepted baseline.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const DEFAULT_THRESHOLD = 0.02; // pixelmatch colour distance, small because renders are deterministic (0.1 misses a one-token ground change); antialiasing is not counted
export const DEFAULT_TOLERANCE = 0.001; // fraction of pixels that may differ (0.1 per cent)

// -> { status: 'ok' | 'diff' | 'missing' | 'size', diffPixels, total, ratio, message }
// A mismatch writes a diff image to diffPath.
export function compareFiles(actualPath, baselinePath, { threshold = DEFAULT_THRESHOLD, tolerance = DEFAULT_TOLERANCE, diffPath } = {}) {
  if (!existsSync(baselinePath)) {
    return { status: 'missing', message: `no baseline PNG at ${baselinePath} (review the shot, then run with --update-baseline)` };
  }
  const a = PNG.sync.read(readFileSync(actualPath));
  const b = PNG.sync.read(readFileSync(baselinePath));
  if (a.width !== b.width || a.height !== b.height) {
    return { status: 'size', message: `size ${a.width}x${a.height} differs from baseline ${b.width}x${b.height}` };
  }
  const out = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold });
  const total = a.width * a.height;
  const ratio = diffPixels / total;
  if (ratio <= tolerance) return { status: 'ok', diffPixels, total, ratio };
  if (diffPath) writeFileSync(diffPath, PNG.sync.write(out));
  return {
    status: 'diff', diffPixels, total, ratio,
    message: `${diffPixels} of ${total} pixels differ (${(ratio * 100).toFixed(3)} per cent, tolerance ${(tolerance * 100).toFixed(3)})`,
  };
}
