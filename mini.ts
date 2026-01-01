// mini: a small programming language and its interpreter, written from nothing, with no library.
// You type a line of mini, such as 1 + 2 * 3, and it answers 7. Start it with: node mini.ts
import * as fs from "node:fs";
import { createInterface } from "node:readline";

let where = 1; // the line mini is at: the line it reads, or the line of the statement it runs

// A mistake in the program mini runs, such as 1 / 0: mini says what it is and goes on. It is not a crash of mini.
class MiniError extends Error {}
type Value = number | boolean | string | Node | null; // a function's value is its own node of the tree
type Token = { kind: string; text: string; line: number };
type Node = { kind: string; [field: string]: any };

// Every number is whole and between -LIMIT and LIMIT, so mini gives the same answers in every language.
const LIMIT = 9007199254740991; // 2 ** 53 - 1: the largest whole number a JavaScript number holds exactly
function checked(n: number): number {
  if (Math.abs(n) > LIMIT) throw new MiniError(`number too big: mini's numbers stop at ${LIMIT}`);
  return n;
}

// A number, from its digits.
function number(text: string): number {
  return checked(text.length > 16 ? Infinity : Number(text));
}

// Work out one operator on two values.
function operate(op: string, a: Value, b: Value): Value {
  if (op === "==") return a === b;
  if (op === "!=") return a !== b;
  if (op === "+" && (typeof a === "string" || typeof b === "string")) return show(a) + show(b);
  if (typeof a !== "number" || typeof b !== "number") throw new MiniError(`${op} needs numbers, not ${quote(a)} and ${quote(b)}`);
  if (op === "<") return a < b;
  if (op === "<=") return a <= b;
  if (op === ">") return a > b;
  if (op === ">=") return a >= b;
  if (op === "+") return checked(a + b);
  if (op === "-") return checked(a - b);
  if (op === "*") return checked(a * b);
  if (b === 0) throw new MiniError("division by zero");
  if (op === "/") return Math.floor(a / b); // a whole number, rounded down: 7 / 2 is 3, and -7 / 2 is -4
  // The remainder has the sign of b, so a is always (a / b) * b + a % b.
  const rest = a % b;
  return rest !== 0 && (rest < 0) !== (b < 0) ? rest + b : rest;
}

// How mini writes a value: true and false in small letters.
function show(value: Value): string {
  if (value === null) return "none";
  if (typeof value === "object") return `<fn ${value.name}>`;
  return String(value);
}

// A value as an error shows it: text in quotes, so "5" and 5 look different.
function quote(value: Value): string {
  return typeof value === "string" ? `"${value}"` : show(value);
}

const SYMBOLS = [ // the symbols mini knows
  "==", "!=", "<=", ">=", "<", ">",
  "+", "-", "*", "/",
  "%",
  "(", ")",
  "=",
  ";",
  "{", "}",
  ",",
];
const WORDS = ["let", "true", "false", "print", "if", "else", "while", "fn", "return"]; // mini's own words

// The tokenizer cuts the source into pieces: a run of spaces, a number, a name and more, or any other one
// character. It turns each piece into a token, the words of mini, and leaves the spaces out.
const PIECES = /[ \t\r]+|#[^\n]*|\n|[0-9]+|[A-Za-z_][A-Za-z_0-9]*|"[^"\n]*"?|[=!<>]=|[\s\S]/gu;
function tokenize(source: string, line = 1): Token[] {
  const tokens: Token[] = [];
  const add = (kind: string, text: string) => tokens.push({ kind, text, line });
  for (const piece of source.match(PIECES) ?? []) {
    where = line;
    if (piece === "\n") {
      add(";", "the end of the line"); // a line end ends a statement, as ; does
      line++;
    } else if (/^[0-9]/.test(piece)) add("number", piece);
    else if (/^[A-Za-z_]/.test(piece)) add(WORDS.includes(piece) ? piece : "name", piece);
    else if (piece[0] === '"') {
      if (piece.length < 2 || !piece.endsWith('"')) throw new MiniError("this text has no closing \"");
      add("text", piece.slice(1, -1));
    }
    else if (SYMBOLS.includes(piece)) add(piece, piece);
    else if (!" \t\r#".includes(piece[0])) throw new MiniError(`unexpected character ${piece}`); // # starts a comment
  }
  add("end", "the end");
  return tokens;
}

// The parser reads the tokens into a tree. binary reads an operand, then each operator with the operand after it.
// Each level of operators has its own function, the loosest first: in 2 + 3 * 4, 3 * 4 is one operand of the +.
function parse(tokens: Token[]): Node[] {
  const peek = (): Token => tokens[0];
  const advance = (): Token => tokens.shift() as Token; // the next token, taken off the list
  const accept = (kind: string): boolean => {
    if (peek().kind !== kind) return false;
    advance();
    return true;
  };
  function expect(kind: string): Token {
    if (peek().kind !== kind) throw new MiniError(`expected ${kind} but found ${peek().text}`);
    return advance();
  }
  let inside = 0; // how many functions the parser is inside: a return is only for inside one

  // Statements, with ; between them, up to the end, or up to the } of a block.
  function statements(end: string): Node[] {
    const list: Node[] = [];
    for (;;) {
      while (accept(";"));
      if (accept(end)) return list;
      if (peek().kind === "end") throw new MiniError("a { has no } to close it");
      const node = lined();
      list.push(node);
      const ok = [";", end, "end"].includes(peek().kind) || ["if", "while", "fn"].includes(node.kind); // these end in }
      if (!ok) throw new MiniError(`expected ; but found ${peek().text}`);
    }
  }
  // A statement, with the line it starts on, for an error to name.
  function lined(): Node {
    where = peek().line;
    return { line: where, ...statement() };
  }
  function block(): Node[] {
    expect("{");
    return statements("}");
  }
  function statement(): Node {
    if (accept("let")) {
      const name = expect("name").text;
      expect("=");
      return { kind: "let", name, value: expression() };
    }
    if (peek().kind === "name" && tokens[1].kind === "=") {
      const name = advance().text;
      advance();
      return { kind: "set", name, value: expression() };
    }
    if (accept("print")) return { kind: "print", value: expression() };
    if (accept("if")) {
      const test = expression();
      const then = block();
      const otherwise = !accept("else") ? [] : peek().kind === "if" ? [lined()] : block();
      return { kind: "if", test, then, otherwise };
    }
    if (accept("while")) return { kind: "while", test: expression(), body: block() };
    if (accept("fn")) {
      const name = expect("name").text;
      expect("(");
      const params: string[] = [];
      while (!accept(")")) {
        if (params.length) expect(",");
        params.push(expect("name").text);
      }
      inside++;
      const body = block();
      inside--;
      return { kind: "fn", name, params, body };
    }
    if (accept("return")) {
      if (!inside) throw new MiniError("return is only for inside a function");
      return { kind: "return", value: [";", "}", "end"].includes(peek().kind) ? null : expression() };
    }
    return { kind: "expr", value: expression() };
  }
  function binary(ops: string[], operand: () => Node): Node {
    let left = operand();
    while (ops.includes(peek().kind)) left = { kind: "binary", op: advance().kind, left, right: operand() };
    return left;
  }
  const expression = (): Node => binary(["==", "!=", "<", "<=", ">", ">="], term);
  const term = (): Node => binary(["+", "-"], factor);
  const factor = (): Node => binary(["*", "/", "%"], unary);
  const unary = (): Node => (accept("-") ? { kind: "negate", value: unary() } : call());
  // A value, then any number of calls of it: f() or f(1, 2).
  function call(): Node {
    let node = primary();
    while (accept("(")) {
      const args: Node[] = [];
      while (!accept(")")) {
        if (args.length) expect(",");
        args.push(expression());
      }
      node = { kind: "call", callee: node, args };
    }
    return node;
  }
  function primary(): Node {
    const token = advance();
    if (token.kind === "number") return { kind: "value", value: number(token.text) };
    if (token.kind === "true" || token.kind === "false") return { kind: "value", value: token.kind === "true" };
    if (token.kind === "text") return { kind: "value", value: token.text };
    if (token.kind === "name") return { kind: "name", name: token.text };
    if (token.kind === "(") {
      const node = expression();
      expect(")");
      return node;
    }
    throw new MiniError(`expected a value but found ${token.text}`);
  }
  return statements("end");
}

// The variables, by name. top is the program's own scope: its variables, at the top level, outside any function.
type Scope = Map<string, Value>;
const top: Scope = new Map();

// The scope that holds a name. A scope is the variables a statement can see.
function find(scope: Scope, name: string): Scope {
  if (scope.has(name)) return scope;
  if (top.has(name)) return top; // a call's own variable first, then the program's
  throw new MiniError(`${name} is not defined`);
}

// mini's own limit on calls inside calls. A recursion that never stops ends here, the same in every language.
const DEEPEST = 50;
let depth = 0;

// A return statement throws this, and the call it is in catches it, with the value.
class Return {
  value: Value;
  constructor(value: Value) {
    this.value = value;
  }
}

// Work out the value of a node of the tree.
function evaluate(node: Node, scope: Scope): Value {
  if (node.kind === "value") return node.value;
  if (node.kind === "name") return find(scope, node.name).get(node.name) as Value;
  if (node.kind === "negate") return operate("-", 0, evaluate(node.value, scope));
  if (node.kind === "call") {
    const fn = evaluate(node.callee, scope);
    const args = node.args.map((arg: Node) => evaluate(arg, scope));
    if (typeof fn !== "object" || fn === null) throw new MiniError(`${quote(fn)} is not a function`);
    if (args.length !== fn.params.length) throw new MiniError(`${fn.name} takes (${fn.params.join(", ")})`);
    if (depth === DEEPEST) throw new MiniError(`too deep: more than ${DEEPEST} calls inside each other`);
    const locals: Scope = new Map(fn.params.map((param, i) => [param, args[i]]));
    const back = where;
    depth++;
    let value: Value = null;
    try {
      run(fn.body, locals);
    } catch (signal) {
      if (!(signal instanceof Return)) throw signal;
      value = signal.value;
    } finally {
      depth--;
    }
    where = back; // back to the line of the call, now that the call is done
    return value;
  }
  return operate(node.op, evaluate(node.left, scope), evaluate(node.right, scope));
}

// Carry out one statement in a scope. The value of a statement that is only an expression is given back.
function execute(node: Node, scope: Scope): Value | undefined {
  where = node.line;
  if (node.kind === "let") scope.set(node.name, evaluate(node.value, scope));
  else if (node.kind === "set") {
    const value = evaluate(node.value, scope);
    find(scope, node.name).set(node.name, value);
  }
  else if (node.kind === "print") console.log(show(evaluate(node.value, scope)));
  else if (node.kind === "if") run(truth(evaluate(node.test, scope), "if") ? node.then : node.otherwise, scope);
  else if (node.kind === "while") {
    while (truth(evaluate(node.test, scope), "while")) {
      run(node.body, scope);
      where = node.line; // back to the while's line, for its test
    }
  }
  else if (node.kind === "fn") scope.set(node.name, node);
  else if (node.kind === "return") throw new Return(node.value ? evaluate(node.value, scope) : null);
  else return evaluate(node.value, scope);
}

// The statements of a block, one after another.
function run(list: Node[], scope: Scope): void {
  for (const node of list) execute(node, scope);
}

// The answer to an if or a while must be true or false.
function truth(value: Value, word: string): boolean {
  if (typeof value !== "boolean") throw new MiniError(`${word} needs true or false, not ${quote(value)}`);
  return value;
}

// Say what went wrong. A mistake in the program is not a crash of mini: anything else is.
function report(error: unknown): void {
  // A program can nest too deep for the language mini is written in too, with no call: 1 + (1 + (1 + ...)).
  const deep = error instanceof RangeError && error.message.includes("call stack");
  if (!(error instanceof MiniError) && !deep) throw error;
  console.log(`error: line ${where}: ${deep ? "too deep" : (error as Error).message}`);
}

// Run some source: a line typed at the prompt, or a whole file. At the prompt, an expression's value is said.
function runSource(source: string, line: number, prompt: boolean): void {
  for (const node of parse(tokenize(source, line))) {
    const value = execute(node, top);
    if (prompt && node.kind === "expr" && value !== null) console.log(show(value as Value));
  }
}

// The prompt mini> shows only when you type at a terminal, not when another program sends the lines.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("mini> ");
}

// Run a line that was typed, and say what went wrong if anything did: a mistake does not stop mini.
function attempt(text: string, line: number): void {
  try {
    runSource(text, line, true);
  } catch (error) {
    report(error);
  }
}

// The prompt: read a line, run it, say the answer, and again, until exit or the end of the input.
function repl(): void {
  if (process.stdin.isTTY) console.log("mini: type a line, then Enter. exit stops mini.");
  let count = 0; // the lines read so far: an error names its line by this count
  ask();
  const input = createInterface({ input: process.stdin });
  input.on("line", (line) => {
    count++;
    if (line.trim() === "exit") process.exit(0);
    if (line.trim()) attempt(line, count);
    ask();
  });
}

// node mini.ts hello.mini runs the file: no prompt, nothing said but what print says, and an error stops it.
const file = process.argv[2];
if (!file) repl();
else {
  try {
    runSource(fs.readFileSync(file, "utf8"), 1, false);
  } catch (error) {
    report(error);
    process.exitCode = 1;
  }
}
