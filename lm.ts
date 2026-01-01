// lm: a tiny language model, written from nothing, with no library.
// It reads a text, learns which character comes next, and writes text of its own. Start it with: node lm.ts
import * as fs from "node:fs";
import { createInterface } from "node:readline";

// The commands lm knows, as help shows them.
const HELP = [
  "text                  what lm read, and what it kept",
  "encode <text>         turn text into numbers, one for each character",
  "decode <numbers>      turn numbers back into text",
  "counts <character>    the characters that came after this one, and how often",
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

// The alphabet: each character of the text once, in order. A character's number is its place in the alphabet.
const ALPHABET = [...new Set(text)].sort().join("");
const V = ALPHABET.length;
function encode(part: string): number[] {
  return [...part].map((ch) => ALPHABET.indexOf(ch));
}
function decode(numbers: number[]): string {
  return numbers.map((n) => ALPHABET[n]).join("");
}
const show = (id: number): string => `"${ALPHABET[id]}"`;

// The text as numbers.
const ids = encode(text);

// pairs[a][b]: how many times character b came right after character a.
const pairs = Array.from({ length: V }, () => new Array<number>(V).fill(0));
for (let i = 0; i + 1 < ids.length; i++) pairs[ids[i]][ids[i + 1]] += 1;

// A whole number, such as 42.
const isNumber = (word: string): boolean => /^[0-9]{1,9}$/.test(word);

// The prompt lm> shows only when you type at a terminal, not when another program sends the commands.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("lm> ");
}

// Run one command, its name and then its words, and give back the answer.
function run(words: string[]): string {
  const [name, ...rest] = words;
  const arg = rest.join(" ");
  if (name === "text") return `lm read ${[...raw].length} characters and kept ${text.length}`;
  if (name === "encode") {
    if (!arg) return "usage: encode <text>";
    const missing = [...arg].find((ch) => !ALPHABET.includes(ch));
    if (missing) return `not in the alphabet: "${missing}". The alphabet is "${ALPHABET}"`;
    return encode(arg).join(" ");
  }
  if (name === "decode") {
    if (!rest.length || !rest.every((w) => isNumber(w) && Number(w) < V)) return `usage: decode <numbers>, each from 0 to ${V - 1}`;
    return `"${decode(rest.map(Number))}"`;
  }
  if (name === "counts") {
    const a = ALPHABET.indexOf(arg);
    if ([...arg].length !== 1 || a < 0) return `usage: counts <character>, one of "${ALPHABET}"`;
    const order = pairs[a].map((count, b) => [count, b]).filter(([count]) => count > 0);
    order.sort((x, y) => y[0] - x[0]);
    let total = 0;
    for (const [count] of order) total += count;
    if (!total) return `nothing came after "${arg}"`;
    const top = order.slice(0, 5).map(([count, b]) => `${show(b)} ${count}`).join(", ");
    return `after "${arg}": ${top}${order.length > 5 ? ` and ${order.length - 5} more` : ""}, ${total} in all`;
  }
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
