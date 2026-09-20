# Make 10 expression engine

DOM-independent native ES modules, with no dependencies or generated puzzle data.
No page or public API is implemented. `.mjs` keeps the modules usable in both the
browser and Node without changing the existing CommonJS WebSocket server.

## Interfaces

- `parse(expression, puzzle?)`: recursive-descent parser with normal precedence
  and left associativity. Only single ASCII digits, whitespace, parentheses,
  binary `+ - * /`, and unary minus are accepted. Passing a four-digit puzzle
  also validates digit order and usage. An equals sign/answer is not input syntax.
- `validate(ast, puzzle)`: checks exactly four original digits and indices.
  Digit strings preserve leading zeroes; arrays of four numeric digits also work.
- `evaluate(ast)`: reduced `{ n: BigInt, d: BigInt }`, or `null` for undefined
  arithmetic. Undefined values propagate, even through multiplication by zero.
- `canonical(ast)`: structural key including digit positions. Removes paired
  unary negations and negation of any exactly-zero child, retaining the child's
  structure. Undefined arithmetic is not zero. Performs no other algebraic
  identities, reassociation, or sign distribution. Parsing and reduction traces
  retain zero negations; this equivalence applies only to method comparison.
- `format(ast)`: readable expression preserving the tree's grouping.
- `reductionSteps(ast)`: immutable AST snapshots ending in a `value` node.
  Signed digits display as literals. Ready operations reduce by innermost
  meaningful grouping, then unary/multiplicative/additive precedence, then
  left-to-right. Grouping is derived from the tree, so redundant parentheses do
  not change the trace. Reduced value nodes retain exact rationals; original
  digit indices remain in unreduced branches. The initial AST remains available
  as provenance for the whole trace.
- `solve(puzzle)`: puzzle string, digits, solvability, exact BigInt solution count,
  and repeatable lazy `solutions()` iterator yielding all solution ASTs.

BigInt is deliberately not JSON-serializable by default. A future API should
serialize numerator, denominator, and counts as decimal strings.

## Completeness and uniqueness

After adjacent unary pairs are cancelled, any expression consists of an ordered
full binary tree, with each digit or binary node optionally negated. Every
internal node splits a contiguous range at one of its boundaries. The solver
visits every boundary, all four binary operators, every combination of child
values, and both root signs for nonzero values. Zero-valued digits and composite
subtrees have only the unsigned alternative because their negation is redundant.
Induction on range length therefore covers every normalized expression.

Equal rational values share a bucket, but each bucket retains **all** structural
alternatives and references to child buckets. Counting uses sums of products of
child counts; lazy expansion recovers all methods. Each tree has one root split,
operator, sign, and child pair, so it has one derivation. Invalid division is
discarded and cannot become valid in a larger expression.

Four digits have five binary tree shapes, three binary operator nodes, and seven
optionally signed nodes: `5 * 4^3 * 2^7 = 40,960` candidate structures before
discarding undefined expressions and redundant zero negations. Redundant
parentheses and unary pairs do not increase this finite space. Other
equivalent-valued trees are intentionally distinct.

## Local verification

From the repository root:

```sh
npm test
npm run make10:exhaustive
```

Tests fully enumerate solutions for representative puzzles and compare the DP
forest against an independent uncompressed enumeration of all signed trees.
The exhaustive script checks all 10,000 ordered puzzles, counts every method,
and validates and round-trips one witness for every solvable puzzle. It prints
only an aggregate report and examples, and writes no files.
