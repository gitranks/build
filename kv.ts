// kv: a key-value database, written from nothing, with no library.
// You type a command, such as set name Ada, and it answers. Start it with: node kv.ts
import { createInterface } from "node:readline";

// The commands kv knows, as help shows them.
const HELP = [
  "help                  this list",
  "exit                  stop kv",
];

// The prompt kv> shows only when you type at a terminal, not when another program sends the commands.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("kv> ");
}

// Run one command, its name and then its words, and give back the answer.
function run(words: string[]): string {
  const [name] = words;
  if (name === "help") return HELP.join("\n");
  return `unknown command: ${name}. Type help for the list.`;
}

console.log("kv: ready. Type help for the commands.");
ask();
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  const words = line.trim().split(/\s+/).filter((word) => word);
  if (words[0] === "exit") process.exit(0);
  if (words.length) console.log(run(words));
  ask();
});
