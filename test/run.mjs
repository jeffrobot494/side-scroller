// ---------------------------------------------------------------------------
// TEST RUNNER — discovers and runs every test/*.test.mjs, aggregates results.
//
//   node test/run.mjs            # run all suites
//   node test/run.mjs gen        # run suites whose filename contains "gen"
//
// Each suite exports `export default async function run(t)` and asserts with
// t.ok / t.eq (see harness.mjs). The runner gives each suite a fresh localStorage
// so state can't leak between suites, and installs the DOM once up front.
// Exit code is nonzero if any assertion failed (usable as a CI gate).
// ---------------------------------------------------------------------------

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeChecker, stubLocalStorage, installDom } from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || "";

installDom();

const files = readdirSync(here)
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => f.includes(filter))
  .sort();

let totalPass = 0;
let totalFail = 0;
const failedSuites = [];

for (const file of files) {
  globalThis.localStorage = stubLocalStorage(); // fresh store per suite
  const mod = await import(join(here, file));
  if (typeof mod.default !== "function") {
    console.log(`\n${file}: no default export — skipped`);
    continue;
  }
  const t = makeChecker();
  try {
    await mod.default(t);
  } catch (e) {
    t.ok(`suite threw: ${e && e.message}`, false);
    console.log(e && e.stack);
  }
  const mark = t.fail ? "✗" : "✓";
  console.log(`\n${mark} ${file} — ${t.pass} passed, ${t.fail} failed`);
  for (const f of t.failures) console.log(`    FAIL  ${f}`);
  totalPass += t.pass;
  totalFail += t.fail;
  if (t.fail) failedSuites.push(file);
}

console.log(`\n${"=".repeat(48)}`);
console.log(`${files.length} suite(s) · ${totalPass} passed · ${totalFail} failed`);
if (failedSuites.length) console.log(`failing: ${failedSuites.join(", ")}`);
process.exit(totalFail ? 1 : 0);
