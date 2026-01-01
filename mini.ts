// mini: a small programming language and its interpreter, written from nothing, with no library.
// You type a line of mini, such as 1 + 2 * 3, and it answers 7. Start it with: node mini.ts
import { createInterface } from "node:readline";

// A mistake in the program mini runs, such as 1 / 0: mini says what it is and goes on. It is not a crash of mini.
class MiniError extends Error {}
type Value = number;
type Token = { kind: string; text: string };
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
  if (op === "+") return checked(a + b);
  if (op === "-") return checked(a - b);
  if (op === "*") return checked(a * b);
  if (b === 0) throw new MiniError("division by zero");
  if (op === "/") return Math.floor(a / b); // a whole number, rounded down: 7 / 2 is 3, and -7 / 2 is -4
  // The remainder has the sign of b, so a is always (a / b) * b + a % b.
  const rest = a % b;
  return rest !== 0 && (rest < 0) !== (b < 0) ? rest + b : rest;
}

const SYMBOLS = [ // the symbols mini knows
  "+", "-", "*", "/",
  "%",
  "(", ")",
];

// The tokenizer cuts the source into pieces: a run of spaces, a number, a name and more, or any other one
// character. It turns each piece into a token, the words of mini, and leaves the spaces out.
const PIECES = /[ \t\r]+|[0-9]+|[\s\S]/gu;
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const add = (kind: string, text: string) => tokens.push({ kind, text });
  for (const piece of source.match(PIECES) ?? []) {
    if (/^[0-9]/.test(piece)) add("number", piece);
    else if (SYMBOLS.includes(piece)) add(piece, piece);
    else if (!" \t\r".includes(piece[0])) throw new MiniError(`unexpected character ${piece}`);
  }
  add("end", "the end");
  return tokens;
}

// The parser reads the tokens into a tree. binary reads an operand, then each operator with the operand after it.
// Each level of operators has its own function, the loosest first: in 2 + 3 * 4, 3 * 4 is one operand of the +.
function parse(tokens: Token[]): Node {
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
  function binary(ops: string[], operand: () => Node): Node {
    let left = operand();
    while (ops.includes(peek().kind)) left = { kind: "binary", op: advance().kind, left, right: operand() };
    return left;
  }
  const expression = (): Node => binary(["+", "-"], factor);
  const factor = (): Node => binary(["*", "/", "%"], unary);
  const unary = (): Node => (accept("-") ? { kind: "negate", value: unary() } : primary());
  function primary(): Node {
    const token = advance();
    if (token.kind === "number") return { kind: "value", value: number(token.text) };
    if (token.kind === "(") {
      const node = expression();
      expect(")");
      return node;
    }
    throw new MiniError(`expected a value but found ${token.text}`);
  }
  const tree = expression();
  if (peek().kind !== "end") throw new MiniError(`expected an operator but found ${peek().text}`);
  return tree;
}

// Work out the value of a node of the tree.
function evaluate(node: Node): Value {
  if (node.kind === "value") return node.value;
  if (node.kind === "negate") return operate("-", 0, evaluate(node.value));
  return operate(node.op, evaluate(node.left), evaluate(node.right));
}

// Say what went wrong. A mistake in the program is not a crash of mini: anything else is.
function report(error: unknown): void {
  if (!(error instanceof MiniError)) throw error;
  console.log(`error: ${error.message}`);
}

// The prompt mini> shows only when you type at a terminal, not when another program sends the lines.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("mini> ");
}

// Run a line that was typed, and say what went wrong if anything did: a mistake does not stop mini.
function attempt(line: string): void {
  try {
    console.log(String(evaluate(parse(tokenize(line)))));
  } catch (error) {
    report(error);
  }
}

// The prompt: read a line, run it, say the answer, and again, until exit or the end of the input.
function repl(): void {
  if (process.stdin.isTTY) console.log("mini: type a line, then Enter. exit stops mini.");
  ask();
  const input = createInterface({ input: process.stdin });
  input.on("line", (line) => {
    if (line.trim() === "exit") process.exit(0);
    if (line.trim()) attempt(line);
    ask();
  });
}

repl();
