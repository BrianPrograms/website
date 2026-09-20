// All values are reduced fractions; null represents undefined arithmetic.
export function rational(n, d = 1n) {
  for (const input of [n, d]) {
    if (typeof input === "number" && !Number.isSafeInteger(input)) {
      throw new Error("Use BigInt or integer strings for values outside the safe integer range.");
    }
  }
  n = BigInt(n);
  d = BigInt(d);
  if (d === 0n) return null;
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n;
  let b = d;
  while (b) [a, b] = [b, a % b];
  return Object.freeze({ n: n / a, d: d / a });
}

export const key = value => value === null ? "undefined" : `${value.n}/${value.d}`;
export const equal = (a, b) => a !== null && b !== null && a.n === b.n && a.d === b.d;
export const negate = value => value === null ? null : rational(-value.n, value.d);
export const text = value => value === null ? "undefined" : value.d === 1n ? String(value.n) : `${value.n}/${value.d}`;

export function calculate(op, a, b) {
  if (a === null || b === null) return null;
  switch (op) {
    case "+": return rational(a.n * b.d + b.n * a.d, a.d * b.d);
    case "-": return rational(a.n * b.d - b.n * a.d, a.d * b.d);
    case "*": return rational(a.n * b.n, a.d * b.d);
    case "/": return rational(a.n * b.d, a.d * b.n);
    default: throw new Error(`Unknown operator: ${op}`);
  }
}
