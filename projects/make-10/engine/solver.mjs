import { rational, key, negate, calculate } from "./rational.mjs";
import { puzzleDigits, digit, binary, negative } from "./expression.mjs";

// Each value bucket is a packed forest: alternatives reference smaller buckets.
// Values are merged for efficiency; all canonically distinct structures remain.
export function solve(puzzle) {
  const digits = puzzleDigits(puzzle);
  const ranges = new Map();
  function build(start, end) {
    const rangeKey = `${start}:${end}`;
    if (ranges.has(rangeKey)) return ranges.get(rangeKey);
    const buckets = new Map();
    function add(value, alternative, count) {
      if (value === null) return;
      const id = key(value);
      if (!buckets.has(id)) buckets.set(id, { value, count: 0n, alternatives: [] });
      const bucket = buckets.get(id);
      bucket.count += count;
      bucket.alternatives.push(alternative);
    }
    if (end - start === 1) {
      const node = digit(digits[start], start);
      add(rational(digits[start]), { node }, 1n);
      if (digits[start] !== 0) add(rational(-digits[start]), { node: negative(node) }, 1n);
    } else {
      for (let split = start + 1; split < end; split++) {
        for (const left of build(start, split).values()) {
          for (const right of build(split, end).values()) {
            for (const op of ["+", "-", "*", "/"]) {
              const value = calculate(op, left.value, right.value);
              if (value === null) continue;
              const count = left.count * right.count;
              add(value, { op, left, right, negated: false }, count);
              // Zero negation is canonically redundant, including composite zeros.
              if (value.n !== 0n) add(negate(value), { op, left, right, negated: true }, count);
            }
          }
        }
      }
    }
    ranges.set(rangeKey, buckets);
    return buckets;
  }
  const solutions = build(0, 4).get("10/1");
  function* expand(bucket) {
    if (!bucket) return;
    for (const alternative of bucket.alternatives) {
      if (alternative.node) { yield alternative.node; continue; }
      for (const left of expand(alternative.left)) {
        for (const right of expand(alternative.right)) {
          const node = binary(alternative.op, left, right);
          yield alternative.negated ? negative(node) : node;
        }
      }
    }
  }
  return {
    puzzle: digits.join(""), digits, solvable: Boolean(solutions),
    solutionCount: solutions?.count ?? 0n,
    // Lazy, repeatable enumeration of every distinct canonical solution AST.
    solutions: () => expand(solutions),
  };
}
