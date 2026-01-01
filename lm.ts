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
  "write <start>         go on from the start, one character at a time",
  "seed <number>         start the random numbers again from this number",
  "loss                  how surprised lm is by the text: lower is better",
  "shapes                the size of each table of numbers in the model",
  "softmax <numbers>     turn scores into chances that add up to 1",
  "next <text>           the model's guess for the character after the text",
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

// The text as numbers, cut in two: the model learns from the first nine tenths and is tested on the last tenth.
const ids = encode(text);
const cut = ids.length - Math.floor(ids.length / 10);
const train = ids.slice(0, cut);
const test = ids.slice(cut);

// pairs[a][b]: how many times character b came right after character a, in the part to learn from.
const pairs = Array.from({ length: V }, () => new Array<number>(V).fill(0));
for (let i = 0; i + 1 < train.length; i++) pairs[train[i]][train[i + 1]] += 1;
const SMOOTH = 0.1; // a pair never seen still gets a small count, so it is unlikely, not impossible

// Random numbers from a seed: the same seed gives the same numbers, on every computer and in both languages.
let state = 1;
function random(): number {
  state = (state * 48271) % 2147483647;
  return state / 2147483647;
}
// Pick a place at random, each as likely as its weight.
function pick(weights: number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let r = random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

// exp and log from + - * / alone, so that every computer gets the very same numbers.
const LN2 = 0.6931471805599453;
function exp(x: number): number {
  const k = Math.floor(x / LN2 + 0.5);
  const r = x - k * LN2; // e to the x is 2 to the k, times e to the r, and r is small
  let sum = 1;
  for (let i = 14; i >= 1; i--) sum = 1 + (sum * r) / i;
  for (let i = 0; i < k; i++) sum *= 2;
  for (let i = 0; i > k; i--) sum /= 2;
  return sum;
}
function log(x: number): number {
  let k = 0;
  for (x = Math.max(x, 1e-300); x >= 2; x /= 2) k += 1;
  for (; x < 1; x *= 2) k -= 1;
  const y = (x - 1) / (x + 1); // x is 2 to the k, times a number from 1 to 2
  let sum = 0;
  for (let i = 39; i >= 1; i -= 2) sum = sum * y * y + 1 / i;
  return k * LN2 + 2 * y * sum;
}
// A number with a fixed count of places after the point, rounded the same way in both languages.
function fmt(x: number, places = 3): string {
  const n = Math.floor(Math.abs(x) * 10 ** places + 0.5);
  const digits = String(n).padStart(places + 1, "0");
  return (x < 0 && n > 0 ? "-" : "") + digits.slice(0, -places) + "." + digits.slice(-places);
}
// The loss: the mean of -log(the chance the counts gave the character that came next). Lower is better.
function countsLoss(part: number[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < part.length; i++) {
    const row = pairs[part[i]];
    sum -= log((row[part[i + 1]] + SMOOTH) / (row.reduce((all, count) => all + count, 0) + SMOOTH * V));
  }
  return sum / (part.length - 1);
}

// The model's sizes: each character becomes D numbers, and the model looks back over T characters at most.
const D = 16;
const T = 8;
type Matrix = number[][];
// A table of numbers, rows by columns, each a small random number to start from.
function matrix(rows: number, cols: number, size: number): Matrix {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (random() * 2 - 1) * size));
}
const model: Record<string, Matrix> = {
  emb: matrix(V, D, 0.5), // a row of numbers for each character
  out: matrix(D, V, 0.5), // from those numbers to a score for each character
};

// A row of numbers times a table: one number for each column of the table.
function times(row: number[], m: Matrix): number[] {
  const out = new Array<number>(m[0].length).fill(0);
  for (let i = 0; i < row.length; i++) for (let j = 0; j < out.length; j++) out[j] += row[i] * m[i][j];
  return out;
}

// Scores to chances: each becomes positive, and together they add up to 1.
function softmax(scores: number[]): number[] {
  const top = Math.max(...scores);
  const e = scores.map((s) => exp(s - top));
  let total = 0;
  for (const x of e) total += x;
  return e.map((x) => x / total);
}

// Run the model over a window of characters: after each one, a score for every character that may come next.
function forward(x: number[]) {
  const z = x.map((id) => model.emb[id]);
  const logits = z.map((row) => times(row, model.out));
  return { x, z, logits, p: logits.map(softmax) };
}
type Pass = ReturnType<typeof forward>;
// The model's loss: the mean of -log(the chance it gave the character that came next).
function lossOf(f: Pass, y: number[]): number {
  let sum = 0;
  for (let t = 0; t < y.length; t++) sum -= log(f.p[t][y[t]]);
  return sum / y.length;
}
// The model's loss over a whole part of the text, window by window.
function surprise(part: number[]): number {
  let sum = 0;
  for (let s = 0; s + 1 < part.length; s += T) {
    const x = part.slice(s, Math.min(s + T, part.length - 1));
    sum += lossOf(forward(x), part.slice(s + 1, s + 1 + x.length)) * x.length;
  }
  return sum / (part.length - 1);
}

// Go on from the start, one character at a time, each picked at random by how often it came next.
const LENGTH = 60;
function write(start: number[]): string {
  const out = [...start];
  while (out.length < start.length + LENGTH) {
    out.push(pick(pairs[out[out.length - 1]].map((count) => count + SMOOTH)));
  }
  return decode(out);
}

// A whole number, such as 42.
const isNumber = (word: string): boolean => /^[0-9]{1,9}$/.test(word);
// A number that may have a point and a minus, such as -1.5.
const isDecimal = (word: string): boolean => /^-?[0-9]{1,4}(\.[0-9]{1,4})?$/.test(word);
// A table's rows by columns, or "broken" when it is not a table whose rows all have the same length.
const shape = (m: unknown): string =>
  Array.isArray(m) && m.length && m.every((row) => Array.isArray(row) && row.length === m[0].length)
    ? `${m.length} × ${m[0].length}`
    : "broken";

// The prompt lm> shows only when you type at a terminal, not when another program sends the commands.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("lm> ");
}

// Run one command, its name and then its words, and give back the answer.
function run(words: string[]): string {
  const [name, ...rest] = words;
  const arg = rest.join(" ");
  if (name === "text") return `lm read ${[...raw].length} characters and kept ${text.length}: ${train.length} to learn from, ${test.length} to test on`;
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
  if (name === "seed") {
    if (!isNumber(arg)) return "usage: seed <number>";
    state = (Number(arg) % 2147483646) + 1;
    return `seed ${Number(arg)}`;
  }
  if (name === "write") {
    if (!arg) return "usage: write <start>";
    const start = clean(arg);
    const missing = [...start].find((ch) => !ALPHABET.includes(ch));
    if (!start || missing) return `not in the alphabet: "${missing ?? arg}"`;
    return write(encode(start));
  }
  if (name === "loss") {
    return [
      `counts: train ${fmt(countsLoss(train))}, test ${fmt(countsLoss(test))}, a blind guess ${fmt(log(V))}`,
      `model: train ${fmt(surprise(train))}, test ${fmt(surprise(test))}`,
    ].join("\n");
  }
  if (name === "shapes") {
    let all = 0;
    for (const m of Object.values(model)) all += m.length * m[0].length;
    return Object.entries(model).map(([key, m]) => `${key} ${shape(m)}`).join(", ") + `: ${all} numbers`;
  }
  if (name === "softmax") {
    if (!rest.length || rest.length > 12 || !rest.every(isDecimal)) return "usage: softmax <numbers>, such as softmax 2 1 0.5";
    return softmax(rest.map(Number)).map((p) => fmt(p)).join(" ");
  }
  if (name === "next") {
    const start = clean(arg);
    const missing = [...start].find((ch) => !ALPHABET.includes(ch));
    if (!start || missing) return "usage: next <text>, with characters of the alphabet";
    const p = forward(encode(start).slice(-T)).p.at(-1) as number[];
    const order = p.map((chance, b) => [chance, b]).sort((x, y) => y[0] - x[0]);
    return `after "${start}": ` + order.slice(0, 5).map(([c, b]) => `${show(b)} ${fmt(c)}`).join(", ");
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
