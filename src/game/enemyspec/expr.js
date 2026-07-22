// ---------------------------------------------------------------------------
// EXPRESSION LANGUAGE — parse + evaluate the small whitelisted condition/score
// language EnemySpecs use in transitions, `if` steps, and utility scoring.
//
//   self.hpPct <= 0.5
//   alive('leftWing') && countAlive('tag:wing') == 0
//   1.5 * sense.los + (sense.playerAbove ? … )   ← no ternary; use arithmetic:
//   1.5 * sense.los + 2 * sense.playerAbove      (booleans coerce to 0/1)
//
// Deliberately tiny: numbers, 'strings', dotted identifiers, the functions
// whitelisted in schema.js, + - * / %, comparisons, && || !, parentheses.
// NO scripting, reflection, assignment, or engine access — a malformed or
// out-of-vocabulary expression is a PARSE ERROR, which validation surfaces and
// the runtime never sees (doc §8: reject, don't guess).
//
// parseExpr(src) → AST (throws Error with a readable message on bad input)
// evalExpr(ast, ctx) → number|boolean.  ctx = { get(path) → value, fn(name, args) }
// compile(src) → { ast, eval(ctx) } convenience with per-call caching by source.
// ---------------------------------------------------------------------------

import { EXPR_FUNCTIONS } from "./schema.js";

// ---- tokenizer ------------------------------------------------------------

const TOKEN_RE = /\s*(?:(\d+\.?\d*|\.\d+)|'([^']*)'|"([^"]*)"|([A-Za-z_][\w.]*)|(&&|\|\||[<>=!]=|[<>])|([+\-*/%(),!]))/y;

function tokenize(src) {
  const toks = [];
  let pos = 0;
  while (pos < src.length) {
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(src);
    if (!m) {
      // nothing matched but non-whitespace remains
      if (src.slice(pos).trim() === "") break;
      throw new Error(`unexpected character '${src.slice(pos).trim()[0]}' at ${pos}`);
    }
    pos = TOKEN_RE.lastIndex;
    if (m[1] !== undefined) toks.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined || m[3] !== undefined) toks.push({ t: "str", v: m[2] ?? m[3] });
    else if (m[4] !== undefined) toks.push({ t: "ident", v: m[4] });
    else if (m[5] !== undefined) toks.push({ t: "op", v: m[5] });
    else if (m[6] !== undefined) toks.push({ t: "op", v: m[6] });
  }
  return toks;
}

// ---- recursive-descent parser --------------------------------------------
// or := and ('||' and)* ; and := not ('&&' not)* ; not := '!' not | cmp
// cmp := sum (relop sum)? ; sum := term (('+'|'-') term)* ;
// term := unary (('*'|'/'|'%') unary)* ; unary := '-' unary | primary
// primary := num | str | ident args? | '(' or ')'

export function parseExpr(src) {
  if (typeof src === "number") return { k: "num", v: src }; // constants allowed
  if (typeof src === "boolean") return { k: "num", v: src ? 1 : 0 };
  if (typeof src !== "string" || !src.trim()) throw new Error("empty expression");
  const toks = tokenize(src);
  let i = 0;

  const peek = () => toks[i];
  const eat = (t, v) => {
    const tok = toks[i];
    if (!tok || tok.t !== t || (v !== undefined && tok.v !== v)) {
      throw new Error(`expected ${v ?? t} at token ${i} in "${src}"`);
    }
    i++;
    return tok;
  };
  const isOp = (...ops) => peek() && peek().t === "op" && ops.includes(peek().v);

  function or() {
    let node = and();
    while (isOp("||")) { eat("op"); node = { k: "or", a: node, b: and() }; }
    return node;
  }
  function and() {
    let node = not();
    while (isOp("&&")) { eat("op"); node = { k: "and", a: node, b: not() }; }
    return node;
  }
  function not() {
    if (isOp("!")) { eat("op"); return { k: "not", a: not() }; }
    return cmp();
  }
  function cmp() {
    const a = sum();
    if (isOp("<", "<=", ">", ">=", "==", "!=")) {
      const op = eat("op").v;
      return { k: "cmp", op, a, b: sum() };
    }
    return a;
  }
  function sum() {
    let node = term();
    while (isOp("+", "-")) { const op = eat("op").v; node = { k: "bin", op, a: node, b: term() }; }
    return node;
  }
  function term() {
    let node = unary();
    while (isOp("*", "/", "%")) { const op = eat("op").v; node = { k: "bin", op, a: node, b: unary() }; }
    return node;
  }
  function unary() {
    if (isOp("-")) { eat("op"); return { k: "neg", a: unary() }; }
    return primary();
  }
  function primary() {
    const tok = peek();
    if (!tok) throw new Error(`unexpected end of expression in "${src}"`);
    if (tok.t === "num") { i++; return { k: "num", v: tok.v }; }
    if (tok.t === "str") { i++; return { k: "str", v: tok.v }; }
    if (tok.t === "ident") {
      i++;
      if (isOp("(")) {
        // function call — whitelist enforced at parse time
        if (!EXPR_FUNCTIONS.includes(tok.v)) throw new Error(`unknown function '${tok.v}'`);
        eat("op", "(");
        const args = [];
        if (!isOp(")")) {
          args.push(or());
          while (isOp(",")) { eat("op"); args.push(or()); }
        }
        eat("op", ")");
        return { k: "call", name: tok.v, args };
      }
      return { k: "get", path: tok.v };
    }
    if (isOp("(")) { eat("op"); const node = or(); eat("op", ")"); return node; }
    throw new Error(`unexpected '${tok.v}' in "${src}"`);
  }

  const ast = or();
  if (i < toks.length) throw new Error(`trailing input after position ${i} in "${src}"`);
  return ast;
}

// ---- evaluator ------------------------------------------------------------
// Missing identifiers evaluate to 0 (a dead part's property, a sense the host
// didn't provide) so a spec degrades instead of throwing mid-mission.

const num = (v) => (typeof v === "number" ? v : v === true ? 1 : v === false ? 0 : v == null ? 0 : Number(v) || 0);

export function evalExpr(ast, ctx) {
  switch (ast.k) {
    case "num": return ast.v;
    case "str": return ast.v;
    case "get": return ctx.get ? ctx.get(ast.path) : 0;
    case "call": return ctx.fn ? ctx.fn(ast.name, ast.args.map((a) => evalExpr(a, ctx))) : 0;
    case "neg": return -num(evalExpr(ast.a, ctx));
    case "not": return !truthy(evalExpr(ast.a, ctx));
    case "or": return truthy(evalExpr(ast.a, ctx)) ? true : truthy(evalExpr(ast.b, ctx));
    case "and": return truthy(evalExpr(ast.a, ctx)) ? truthy(evalExpr(ast.b, ctx)) : false;
    case "cmp": {
      const a = evalExpr(ast.a, ctx);
      const b = evalExpr(ast.b, ctx);
      switch (ast.op) {
        case "<": return num(a) < num(b);
        case "<=": return num(a) <= num(b);
        case ">": return num(a) > num(b);
        case ">=": return num(a) >= num(b);
        case "==": return a === b || num(a) === num(b) && typeof a !== "string" && typeof b !== "string";
        case "!=": return !(a === b || num(a) === num(b) && typeof a !== "string" && typeof b !== "string");
      }
      return false;
    }
    case "bin": {
      const a = num(evalExpr(ast.a, ctx));
      const b = num(evalExpr(ast.b, ctx));
      switch (ast.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return b === 0 ? 0 : a / b;
        case "%": return b === 0 ? 0 : a % b;
      }
      return 0;
    }
  }
  return 0;
}

function truthy(v) {
  return v === true || (typeof v === "number" && v !== 0) || (typeof v === "string" && v !== "");
}

// ---- compile cache --------------------------------------------------------
// Specs re-evaluate the same expression strings every frame; cache ASTs by
// source so the parser runs once per distinct string.

const CACHE = new Map();

export function compile(src) {
  const key = typeof src === "string" ? src : `#${src}`;
  let ast = CACHE.get(key);
  if (!ast) {
    ast = parseExpr(src);
    if (CACHE.size > 2000) CACHE.clear(); // unbounded-growth guard
    CACHE.set(key, ast);
  }
  return ast;
}

// Convenience: evaluate a source string (or constant) against a ctx.
export function evaluate(src, ctx) {
  return evalExpr(compile(src), ctx);
}
