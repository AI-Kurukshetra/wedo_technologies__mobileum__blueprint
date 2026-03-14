/**
 * Work around environments where `fs.rename` can throw EXDEV even on paths that
 * appear to be on the same filesystem (seen in some sandboxed/overlay setups).
 *
 * Next.js uses `rename()` during `next build` (e.g., moving generated HTML).
 * When EXDEV happens, falling back to copy+unlink keeps the build working.
 *
 * This file is intended to be preloaded via:
 *   NODE_OPTIONS="--require ./scripts/fs-rename-exdev-fallback.cjs"
 */

const fs = require("node:fs");
const fsp = require("node:fs/promises");

function isExdev(error) {
  return error && typeof error === "object" && error.code === "EXDEV";
}

const originalRename = fs.rename.bind(fs);
fs.rename = function patchedRename(oldPath, newPath, cb) {
  if (typeof cb !== "function") return originalRename(oldPath, newPath, cb);
  return originalRename(oldPath, newPath, (err) => {
    if (!isExdev(err)) return cb(err);
    fs.copyFile(oldPath, newPath, (copyErr) => {
      if (copyErr) return cb(copyErr);
      fs.unlink(oldPath, cb);
    });
  });
};

const originalPromisesRename = fsp.rename.bind(fsp);
fsp.rename = function patchedPromisesRename(oldPath, newPath) {
  return originalPromisesRename(oldPath, newPath).catch(async (err) => {
    if (!isExdev(err)) throw err;
    await fsp.copyFile(oldPath, newPath);
    await fsp.unlink(oldPath);
  });
};
