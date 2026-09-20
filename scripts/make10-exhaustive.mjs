// Development-only report. Never writes puzzle/solution data into static assets.
import assert from "node:assert/strict";
import { solve } from "../projects/make-10/engine/solver.mjs";
import { validate, evaluate, canonical, format, parse } from "../projects/make-10/engine/expression.mjs";
import { key } from "../projects/make-10/engine/rational.mjs";

let solvable = 0;
let totalMethods = 0n;
const unsolvableExamples = [];
const examples = [];
const started = performance.now();
for (let i = 0; i < 10000; i++) {
  const puzzle = String(i).padStart(4, "0");
  const result = solve(puzzle);
  totalMethods += result.solutionCount;
  if (result.solvable) {
    solvable++;
    const first = result.solutions().next().value;
    assert.equal(validate(first, puzzle), true);
    assert.equal(key(evaluate(first)), "10/1");
    assert.equal(canonical(parse(format(first), puzzle)), canonical(first));
    if (["1350", "1234", "7734", "5555", "9999"].includes(puzzle)) {
      examples.push({ puzzle, solutionCount: String(result.solutionCount), expression: format(first) });
    }
  } else if (unsolvableExamples.length < 12) unsolvableExamples.push(puzzle);
  if ((i + 1) % 1000 === 0) console.log(`Checked ${i + 1}/10000 puzzles (${solvable} solvable so far).`);
}
console.log(JSON.stringify({
  puzzles: 10000, solvable, unsolvable: 10000 - solvable,
  totalCanonicalSolutions: String(totalMethods), unsolvableExamples, examples,
  seconds: Number(((performance.now() - started) / 1000).toFixed(2)),
}, null, 2));
