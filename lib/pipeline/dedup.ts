import { createHash } from "node:crypto";

export function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function hashStringList(parts: string[]) {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\n");
  return h.digest("hex");
}

export function computeCdrBatchDedupKey(params: { importId: string; rowHashes: string[]; fromIso: string; toIso: string }) {
  const rowsDigest = hashStringList(params.rowHashes);
  return sha256Hex(`${params.importId}|${params.fromIso}|${params.toIso}|${rowsDigest}`);
}

