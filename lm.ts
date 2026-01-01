// lm: a tiny language model, written from nothing, with no library.
// It reads a text, learns which character comes next, and writes text of its own. Start it with: node lm.ts
import { createInterface } from "node:readline";

// The commands lm knows, as help shows them.
const HELP = [
  "help                  this list",
  "exit                  stop lm",
];

// The prompt lm> shows only when you type at a terminal, not when another program sends the commands.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("lm> ");
}

// Run one command, its name and then its words, and give back the answer.
function run(words: string[]): string {
  const [name] = words;
  if (name === "help") return HELP.join("\n");
  return `unknown command: ${name}. Type help for the list.`;
}

console.log("lm: ready. Type help for the commands.");
ask();
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  const words = line.replaceAll("\t", " ").split(" ").filter((word) => word);
  if (words[0] === "exit") process.exit(0);
  if (words.length) console.log(run(words));
  ask();
});
