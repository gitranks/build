// lm: a tiny language model, written from nothing, with no library.
// It reads a text, learns which character comes next, and writes text of its own. Start it with: node lm.ts
import * as fs from "node:fs";
import { createInterface } from "node:readline";

// The commands lm knows, as help shows them.
const HELP = [
  "text                  what lm read, and what it kept",
  "help                  this list",
  "exit                  stop lm",
];

// The text lm learns from. --text picks another file.
const at = process.argv.indexOf("--text");
const FILE = at > 0 && process.argv[at + 1] ? process.argv[at + 1] : "text.txt";

// Clean a text: small letters, full stops and commas stay, each run of spaces and line ends becomes one space, and
// every other character goes.
const KEEP = "abcdefghijklmnopqrstuvwxyz.,";
function clean(raw: string): string {
  let out = "";
  for (const ch of raw.toLowerCase()) {
    if (KEEP.includes(ch)) out += ch;
    else if (" \t\r\n".includes(ch) && out && !out.endsWith(" ")) out += " ";
  }
  return out.trimEnd();
}
if (!fs.existsSync(FILE)) {
  console.log(`lm: there is no ${FILE} to read`);
  process.exit(1);
}
const raw = fs.readFileSync(FILE, "utf8");
const text = clean(raw);
if (text.length < 100 || new Set(text).size < 2) {
  console.log("lm: the text is too short: it needs 100 characters or more after cleaning, of two kinds at least");
  process.exit(1);
}

// The prompt lm> shows only when you type at a terminal, not when another program sends the commands.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("lm> ");
}

// Run one command, its name and then its words, and give back the answer.
function run(words: string[]): string {
  const [name] = words;
  if (name === "text") return `lm read ${[...raw].length} characters and kept ${text.length}`;
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
