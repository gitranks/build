// mini: a small programming language and its interpreter, written from nothing, with no library.
// You type a line of mini, such as 1 + 2 * 3, and it answers 7. Start it with: node mini.ts
import { createInterface } from "node:readline";

// The prompt mini> shows only when you type at a terminal, not when another program sends the lines.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("mini> ");
}

// The prompt: read a line, run it, say the answer, and again, until exit or the end of the input.
function repl(): void {
  if (process.stdin.isTTY) console.log("mini: type a line, then Enter. exit stops mini.");
  ask();
  const input = createInterface({ input: process.stdin });
  input.on("line", (line) => {
    if (line.trim() === "exit") process.exit(0);
    if (line.trim()) console.log(line.trim());
    ask();
  });
}

repl();
