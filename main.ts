// main.ts - the harness entrypoint for diff-speed-01-run-20261126.
//
// Node runs `node /bot/main.ts` in a fresh container: /input holds
// cases.json, /output takes answers.json. Paths are absolute, anchored
// to the filesystem root, so the working directory does not matter.
// The output directory is created, never deleted (in the grading
// container /output is a mounted volume; removing it fails).
// Incremental marking is switched off before solve.js is loaded, the
// same V8 tuning the house baseline uses.

import { setFlagsFromString } from "node:v8";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

setFlagsFromString("--no-incremental-marking");

const { run } = await import("./solve.js");

// Read every case, answer each with run, write the answers in order.
// Input / output directories can be overridden for local runs; the
// defaults are the paths the grading container provides.
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const cases = JSON.parse(readFileSync(`${inputDir}/cases.json`, "utf8"));
const answers = [];
for (const c of cases) answers.push(run(c.input));

mkdirSync(outputDir, { recursive: true });
writeFileSync(`${outputDir}/answers.json`, JSON.stringify(answers));
