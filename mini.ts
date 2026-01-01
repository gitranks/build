// mini: a small programming language and its interpreter, written from nothing, with no library.
// You type a line of mini, such as 1 + 2 * 3, and it answers 7. Start it with: node mini.ts
import { createInterface } from "node:readline";

// A mistake in the program mini runs, such as 1 / 0: mini says what it is and goes on. It is not a crash of mini.
class MiniError extends Error {}
type Value = number;

// A number, from its digits.
function number(text: string): number {
  if (!/^[0-9]+$/.test(text)) throw new MiniError(`${text} is not a number`);
  return Number(text);
}

// Work out one operator on two values.
function operate(op: string, a: Value, b: Value): Value {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (b === 0) throw new MiniError("division by zero");
  return Math.floor(a / b); // a whole number, rounded down: 7 / 2 is 3
}

// Work out words such as 12 + 30 - 2: a number, then an operator and a number, again and again, from left to right.
function calculate(words: string[]): Value {
  let total = number(words[0]);
  for (let i = 1; i < words.length; i += 2) {
    const op = words[i];
    if (!["+", "-", "*", "/"].includes(op)) throw new MiniError(`${op} is not an operator`);
    if (i + 1 === words.length) throw new MiniError(`${op} needs a number after it`);
    total = operate(op, total, number(words[i + 1]));
  }
  return total;
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
    console.log(String(calculate(line.trim().split(/\s+/))));
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
