/**
 * Fetch and verify the Chan et al. 2025 "Set B" screening benchmark (brief 015).
 *
 * Dataset: doi:10.17632/7sgmg89zb6.1, CC BY 4.0 (Chan, He, Leung, Verspoor 2025,
 * Research Synthesis Methods, doi:10.1017/rsm.2025.1). Cached outside git at
 * ~/.cache/blindspot/chan2025/. Idempotent: a verified zip is not re-downloaded.
 *
 * RUN:
 *   npx tsx scripts/fetch-chan2025-setb.ts
 *   npx tsx scripts/fetch-chan2025-setb.ts --from /path/to/local.zip   # if the download is blocked
 *
 * Never bypasses a bot check: if the download fails, use --from.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const URL =
  "https://data.mendeley.com/public-files/datasets/7sgmg89zb6/files/e441755b-b1dd-43f4-8ea1-19846ad35ef5/file_downloaded";
const SHA256 = "649d89336b68f314f6177ef90a2da274e22e7c755a3729634b574698362e48d3";
const CACHE = path.join(homedir(), ".cache", "blindspot", "chan2025");
const ZIP = path.join(CACHE, "setb.zip");
const OUT = path.join(CACHE, "x");

const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

async function main() {
  const fromIdx = process.argv.indexOf("--from");
  const from = fromIdx >= 0 ? process.argv[fromIdx + 1] : null;
  mkdirSync(CACHE, { recursive: true });

  if (!(existsSync(ZIP) && sha(ZIP) === SHA256)) {
    if (from) {
      copyFileSync(from, ZIP);
      console.log(`copied ${from} (--from)`);
    } else {
      const res = await fetch(URL, { redirect: "follow" });
      if (!res.ok) throw new Error(`download failed: HTTP ${res.status}; retry with --from <local zip>`);
      writeFileSync(ZIP, Buffer.from(await res.arrayBuffer()));
    }
    if (sha(ZIP) !== SHA256) throw new Error("sha256 mismatch; refusing to use this file");
  }
  console.log("zip verified:", SHA256);

  mkdirSync(OUT, { recursive: true });
  execFileSync("unzip", ["-qo", ZIP, "-d", OUT]);
  console.log("extracted to", OUT);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
