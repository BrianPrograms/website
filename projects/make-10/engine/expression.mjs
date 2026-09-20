import { rational, calculate, negate, text } from "./rational.mjs";

export function puzzleDigits(puzzle) {
  const digits = typeof puzzle === "string" ? [...puzzle].map(Number) : puzzle;
  if ((typeof puzzle === "string" && !/^[0-9]{4}$/.test(puzzle)) ||
      !Array.isArray(digits) || digits.length !== 4 ||
      digits.some(d => !Number.isInteger(d) || d < 0 || d > 9)) {
    throw new Error("A puzzle must contain exactly four digits from 0 to 9.");
  }
  return [...digits];
}

export const digit = (value, index) => ({ type: "digit", value, index });
export const binary = (op, left, right) => ({ type: "binary", op, left, right });
export const negative = child => child.type === "neg" ? child.child : { type: "neg", child };

// Parentheses determine the tree; redundant grouping has no separate AST node.
// Parsing alone accepts any number of digit tokens; pass a puzzle to validate four.
export function parse(source, puzzle) {
  if (typeof source !== "string") throw new Error("Expression must be text.");
  let cursor = 0;
  let index = 0;
  const skip = () => { while (/\s/.test(source[cursor] ?? "") && cursor < source.length) cursor++; };
  const peek = () => { skip(); return source[cursor]; };
  function atom() {
    const token = peek();
    if (token === "-") { cursor++; return negative(atom()); }
    if (token === "(") {
      cursor++;
      const node = sum();
      if (peek() !== ")") throw new Error("Expected closing parenthesis.");
      cursor++;
      return node;
    }
    if (token !== undefined && /^[0-9]$/.test(token)) {
      cursor++;
      return digit(Number(token), index++);
    }
    throw new Error("Expected a digit, unary minus, or parenthesis.");
  }
  function product() {
    let node = atom();
    while (peek() === "*" || peek() === "/") {
      const op = source[cursor++];
      node = binary(op, node, atom());
    }
    return node;
  }
  function sum() {
    let node = product();
    while (peek() === "+" || peek() === "-") {
      const op = source[cursor++];
      node = binary(op, node, product());
    }
    return node;
  }
  const result = sum();
  if (peek() !== undefined) throw new Error("Unexpected token; concatenation and implicit multiplication are forbidden.");
  if (puzzle !== undefined) validate(result, puzzle);
  return result;
}

export function validate(node, puzzle) {
  const digits = puzzleDigits(puzzle);
  let index = 0;
  function visit(current) {
    if (!current || typeof current !== "object") throw new Error("Invalid AST.");
    switch (current.type) {
      case "digit":
        if (index >= 4 || current.index !== index || current.value !== digits[index]) {
          throw new Error("Digits must be used exactly once in their original order and positions.");
        }
        index++;
        break;
      case "neg": visit(current.child); break;
      case "binary":
        if (!["+", "-", "*", "/"].includes(current.op)) throw new Error("Invalid operator.");
        visit(current.left); visit(current.right); break;
      default: throw new Error("Invalid AST node.");
    }
  }
  visit(node);
  if (index !== 4) throw new Error("All four digits must be used.");
  return true;
}

export function normalize(node) {
  if (node.type === "neg") return negative(normalize(node.child));
  if (node.type === "binary") return binary(node.op, normalize(node.left), normalize(node.right));
  return { ...node };
}

export function canonical(node) {
  function encode(n) {
    if (n.type === "digit") return `d${n.index}:${n.value}`;
    if (n.type === "neg") {
      // Drop only this sign, preserving the entire zero-valued child structure.
      const value = evaluate(n.child);
      return value !== null && value.n === 0n ? encode(n.child) : `neg(${encode(n.child)})`;
    }
    if (n.type === "binary") return `${n.op}(${encode(n.left)},${encode(n.right)})`;
    throw new Error("Canonical methods require an expression AST.");
  }
  return encode(normalize(node));
}

export function evaluate(node) {
  switch (node.type) {
    case "digit": return rational(node.value);
    case "value": return node.value;
    case "neg": return negate(evaluate(node.child));
    case "binary": return calculate(node.op, evaluate(node.left), evaluate(node.right));
    default: throw new Error("Invalid AST node.");
  }
}

const precedence = n => n.type === "binary" ? (["+", "-"].includes(n.op) ? 1 : 2) : n.type === "neg" ? 3 : 4;

export function format(node) {
  if (node.type === "digit") return String(node.value);
  if (node.type === "value") return text(node.value);
  if (node.type === "neg") {
    const child = format(node.child);
    return node.child.type === "digit" ? `-${child}` : `-(${child})`;
  }
  function operand(child, right) {
    const wrap = precedence(child) < precedence(node) ||
      (right && precedence(child) === precedence(node)) ||
      child.type === "neg" ||
      (child.type === "value" && child.value !== null && (child.value.d !== 1n || child.value.n < 0n));
    return wrap ? `(${format(child)})` : format(child);
  }
  return `${operand(node.left, false)} ${node.op} ${operand(node.right, true)}`;
}

// Immutable snapshots retain untouched digit indices and expression structure.
// Signed digits are literals. Among ready operations, reduce innermost grouping,
// then unary / multiplicative / additive precedence, then left-to-right.
// Value nodes contain an exact rational or null.
export function reductionSteps(expression) {
  let current = normalize(expression);
  const states = [current];
  const literal = n => n.type === "digit" || n.type === "value" ||
    (n.type === "neg" && n.child.type === "digit");
  function reduce(root) {
    if (literal(root)) return { type: "value", value: evaluate(root) };
    const ready = [];
    function visit(n, path, depth) {
      if (literal(n)) return;
      const children = n.type === "neg" ? ["child"] : ["left", "right"];
      if (children.every(field => literal(n[field]))) {
        ready.push({ path, depth, priority: precedence(n), node: n });
        return;
      }
      for (const field of children) {
        const child = n[field];
        const grouped = n.type === "neg" || precedence(child) < precedence(n) ||
          (field === "right" && precedence(child) === precedence(n));
        visit(child, [...path, field], depth + Number(grouped));
      }
    }
    visit(root, [], 0);
    // Stable sort preserves left-to-right order among equally ranked operations.
    ready.sort((a, b) => b.depth - a.depth || b.priority - a.priority);
    const chosen = ready[0];
    function replace(n, offset) {
      if (offset === chosen.path.length) return { type: "value", value: evaluate(chosen.node) };
      const field = chosen.path[offset];
      return { ...n, [field]: replace(n[field], offset + 1) };
    }
    return replace(root, 0);
  }
  while (current.type !== "value") { current = reduce(current); states.push(current); }
  return states;
}
