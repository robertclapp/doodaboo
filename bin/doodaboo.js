#!/usr/bin/env node
// Production launcher for the doodaboo CLI. Bridges to the TS entry
// point via tsx so users get the same code path as `npm run cli`.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, "..", "cli", "index.ts");

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", entry, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
