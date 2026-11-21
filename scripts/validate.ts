/**
 * CLI: validate the built playable against the network specs.
 * Usage: node scripts/validate.ts [path] [--json]
 * Exit code 0 = pass, 1 = fail (including a missing file), 2 = usage error.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { validatePlayable } from "../src/qa/validate.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const paths = args.filter((arg) => !arg.startsWith("--"));

if (paths.length > 1) {
  console.error("usage: node scripts/validate.ts [path] [--json]");
  process.exit(2);
}

const file = resolve(paths[0] ?? "dist/index.html");

if (!existsSync(file)) {
  console.error(`FAIL: ${file} does not exist. Run "npm run build" first.`);
  process.exit(1);
}

const buffer = readFileSync(file);
const html = buffer.toString("utf8");
const verdict = validatePlayable(html, statSync(file).size);
const sha256 = createHash("sha256").update(buffer).digest("hex");

if (json) {
  console.log(JSON.stringify({ file, sha256, ...verdict }, null, 2));
} else {
  console.log(`File:   ${file}`);
  console.log(`Size:   ${(verdict.bytes / 1024).toFixed(1)} KB`);
  console.log(`SHA256: ${sha256}`);
  console.log("");
  for (const rule of verdict.rules) {
    const mark = rule.passed ? "PASS" : rule.severity === "error" ? "FAIL" : "WARN";
    console.log(`${mark}  ${rule.id.padEnd(18)} ${rule.description} (${rule.detail})`);
  }
  console.log("");
  console.log(verdict.passed ? "VERDICT: PASS" : "VERDICT: FAIL");
}

process.exit(verdict.passed ? 0 : 1);
