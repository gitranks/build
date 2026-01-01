// pipe: a small data pipeline, written from nothing, with no library.
// It reads the CSV files in its inbox, cleans their rows, counts them minute by minute and answers questions.
// Start it with: node pipe.ts
import { createInterface } from "node:readline";

// The commands pipe knows, as help shows them.
const HELP = [
  "help                          this list",
  "exit                          stop pipe",
];

// The prompt pipe> shows only when you type at a terminal, not when another program sends the commands.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("pipe> ");
}

// Do one command, its name and then its words, and give back the answer.
function command(words: string[]): string {
  const [name] = words;
  if (name === "help") return HELP.join("\n");
  return `unknown command: ${name}. Type help for the list.`;
}

console.log("pipe: ready. Type help for the commands.");
ask();
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  const words = line.trim().split(/\s+/).filter((word) => word);
  if (words[0] === "exit") process.exit(0);
  if (words.length) console.log(command(words));
  ask();
});
