import test from "node:test";
import assert from "node:assert/strict";
import { rational, calculate, equal, key } from "../../projects/make-10/engine/rational.mjs";
import { parse, evaluate, canonical, format, validate, reductionSteps, digit, binary, negative } from "../../projects/make-10/engine/expression.mjs";
import { solve } from "../../projects/make-10/engine/solver.mjs";

test("exact arithmetic, precedence, grouping, and unary minus", () => {
  const examples = [
    ["1+2", "3/1"], ["1-3", "-2/1"], ["3*4", "12/1"], ["3/4", "3/4"],
    ["8/4*2", "4/1"], ["8-4-2", "2/1"], ["1+2*3", "7/1"],
    ["8/2+3*4", "16/1"], ["(1+2)*3", "9/1"], ["8/(4/2)", "4/1"],
    ["((1+2)*(3-1))", "6/1"], ["-5+3", "-2/1"], ["-(1+3)", "-4/1"],
    ["--5", "5/1"], ["---5", "-5/1"], ["1--3", "4/1"],
    ["(1-3)*(-5)+0", "10/1"], ["1/3+1/3+1/3", "1/1"],
    ["0/3", "0/1"], ["-0", "0/1"], ["1/0", "undefined"],
    ["0/0", "undefined"], ["0*(1/0)", "undefined"], ["1/(3-3)", "undefined"],
  ];
  for (const [expression, expected] of examples) assert.equal(key(evaluate(parse(expression))), expected, expression);
  const large = 9007199254740993n;
  assert.equal(key(calculate("-", rational(large), rational(large - 1n))), "1/1");
  assert.equal(key(calculate("+", rational(1n, large), rational(large - 1n, large))), "1/1");
  assert.equal(key(rational(6n, -8n)), "-3/4");
  assert.equal(key(rational(0n, -8n)), "0/1");
  assert.equal(equal(null, null), false);
  assert.throws(() => rational(Number.MAX_SAFE_INTEGER + 1));
});

test("puzzle validation preserves digit identity, order, repeats, and zeros", () => {
  assert.equal(validate(parse("(1-3)*(-5)+0"), "1350"), true);
  assert.equal(validate(parse("0+0+1+7"), "0017"), true);
  assert.equal(validate(parse("7+7+3+4"), "7734"), true);
  for (const expression of ["3+1+5+0", "1+3+5", "1+3+5+0+0", "1+3+5+5"]) {
    assert.throws(() => parse(expression, "1350"));
  }
  const repeated = parse("1+1+1+1", "1111");
  repeated.right.index = 0;
  assert.throws(() => validate(repeated, "1111"));
  assert.throws(() => validate({ type: "value", value: rational(10) }, "1350"));
  for (const source of ["41+3+1", "4 1+3+1", "2(3+4)", "1.5+3", "1e3", "Math.random()", "1**3", "", "()", "(1+3", "1+3)", "+1"]) {
    assert.throws(() => parse(source), source);
  }
  for (const puzzle of ["123", "12345", "1 23", "abcd", 1234, [1, 2, 3, 10], [1, 2, 3, -1]]) {
    assert.throws(() => solve(puzzle));
  }
});

test("canonical methods remove only redundant grouping and unary pairs", () => {
  const same = (a, b) => assert.equal(canonical(parse(a)), canonical(parse(b)));
  same("(4-1)*3+1", "((4-1)*3)+1");
  same("-5", "(-5)");
  same("---5", "-5");
  same("--(1+3)", "1+3");
  same("-(-(-(1+3)))", "-(1+3)");
  assert.notEqual(canonical(parse("(1+2)+3")), canonical(parse("1+(2+3)")));
  assert.notEqual(canonical(parse("1-2")), canonical(parse("1+(-2)")));
  same("0", "-0");
  assert.notEqual(canonical(parse("-(1+3)")), canonical(parse("-1+(-3)")));
});

test("canonical zero negation is redundant without simplifying its child", () => {
  for (const [a, b] of [
    ["-0", "0"], ["---0", "0"], ["-(3-3)", "3-3"],
    ["---(3-3)", "3-3"], ["-(-(3-3))", "3-3"],
    ["5+(-(3-3))+5", "5+(3-3)+5"],
    ["-((1/3+1/3+1/3)-1)", "(1/3+1/3+1/3)-1"],
    ["-((-0)*(3-3))", "0*(3-3)"],
  ]) assert.equal(canonical(parse(a)), canonical(parse(b)), a);
  for (const [a, b] of [
    ["-(1+3)", "(-1)+(-3)"], ["3-3", "3+(-3)"],
    ["-(3-3)", "0"], ["-(0/0)", "0/0"],
    ["-(0*(1/0))", "0*(1/0)"],
  ]) assert.notEqual(canonical(parse(a)), canonical(parse(b)), a);
  const ast = parse("-(3-3)");
  const before = format(ast);
  canonical(ast);
  assert.equal(format(ast), before, "method comparison must not mutate the expression");
});

test("structured reduction states follow grouping, precedence, and associativity", () => {
  const steps = source => reductionSteps(parse(source)).map(format);
  assert.deepEqual(steps("(1-3)*(-5)+0"), ["(1 - 3) * (-5) + 0", "(-2) * (-5) + 0", "10 + 0", "10"]);
  assert.deepEqual(steps("1+2*3"), ["1 + 2 * 3", "1 + 6", "7"]);
  assert.deepEqual(steps("1+2+3*4"), ["1 + 2 + 3 * 4", "1 + 2 + 12", "3 + 12", "15"]);
  assert.deepEqual(steps("(1+2)*3+4*5"), ["(1 + 2) * 3 + 4 * 5", "3 * 3 + 4 * 5", "9 + 4 * 5", "9 + 20", "29"]);
  assert.deepEqual(steps("8/4*2"), ["8 / 4 * 2", "2 * 2", "4"]);
  assert.deepEqual(steps("-(1+3)*2"), ["(-(1 + 3)) * 2", "(-(4)) * 2", "(-4) * 2", "-8"]);
  assert.deepEqual(steps("1/(3-3)"), ["1 / (3 - 3)", "1 / 0", "undefined"]);
  for (const source of ["(1-3)*(-5)+0", "((1+2)*(3-1))", "1/(2/3)", "-(1+3)*2", "0*(1/0)"]) {
    const tree = parse(source);
    const before = canonical(tree);
    for (const state of reductionSteps(tree)) assert.equal(key(evaluate(state)), key(evaluate(tree)));
    assert.equal(canonical(tree), before, "steps must not mutate the input");
  }
});

test("solver enumerates distinct valid methods and round-trips all sampled solutions", () => {
  for (const puzzle of ["1350", "1234", "5555", "0000", "1111", "0017", "7734", "9999", "0123", "1010", "3355"]) {
    const result = solve(puzzle);
    const methods = new Set();
    for (const ast of result.solutions()) {
      assert.equal(validate(ast, puzzle), true);
      assert.equal(key(evaluate(ast)), "10/1");
      const id = canonical(ast);
      assert.equal(methods.has(id), false, `duplicate method for ${puzzle}`);
      methods.add(id);
      assert.equal(canonical(parse(format(ast), puzzle)), id);
    }
    assert.equal(BigInt(methods.size), result.solutionCount);
    assert.equal(result.solvable, methods.size > 0);
    if (puzzle === "1350") assert.ok(methods.has(canonical(parse("(1-3)*(-5)+0"))));
  }
  for (const puzzle of ["1350", "1234", "5555"]) assert.equal(solve(puzzle).solvable, true);
  for (const puzzle of ["0000", "1111", "0017"]) assert.equal(solve(puzzle).solvable, false);
});

// Independent explicit enumeration: build all 40,960 signed syntax trees first,
// including undefined trees, then evaluate. No rational buckets or DP counts.
function* rawTrees(digits, start = 0, end = 4) {
  if (end - start === 1) {
    const node = digit(digits[start], start);
    yield node; yield negative(node); return;
  }
  for (let split = start + 1; split < end; split++) {
    for (const left of rawTrees(digits, start, split)) {
      for (const right of rawTrees(digits, split, end)) {
        for (const op of ["+", "-", "*", "/"]) {
          const node = binary(op, left, right);
          yield node; yield negative(node);
        }
      }
    }
  }
}

test("packed solver matches every solution from independent full syntax enumeration", () => {
  for (const puzzle of ["1350", "0000", "0017", "7734", "1234", "3355"]) {
    let total = 0;
    const expected = new Set();
    for (const ast of rawTrees([...puzzle].map(Number))) {
      total++;
      if (key(evaluate(ast)) === "10/1") expected.add(canonical(ast));
    }
    assert.equal(total, 40960);
    assert.deepEqual(new Set([...solve(puzzle).solutions()].map(canonical)), expected);
  }
});
