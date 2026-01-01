// pipe: a small data pipeline, written from nothing, with no library.
// It reads the CSV files in its inbox, cleans their rows, counts them minute by minute and answers questions.
// Start it with: node pipe.ts
import * as fs from "node:fs";
import { createInterface } from "node:readline";

// The commands pipe knows, as help shows them.
const HELP = [
  "files                         list the CSV files in the inbox folder",
  "run                           read every file in the inbox",
  "rows                          show the rows the last run kept, 10 at most",
  "bad                           show the lines the last run dropped and why, 10 at most",
  "help                          this list",
  "exit                          stop pipe",
];

let rows: string[][] = []; // the rows the last run kept
let bad: string[] = []; // the lines it dropped, and why

// The names of the CSV files in the inbox folder, in order.
function inbox(): string[] {
  if (!fs.existsSync("inbox")) return [];
  return fs.readdirSync("inbox").filter((name) => name.endsWith(".csv")).sort();
}

// A file's whole lines. A last piece with no line end may still be being written, so it waits for a later run.
function lines(name: string): string[] {
  const all = fs.readFileSync(`inbox/${name}`, "utf8").split("\n");
  all.pop();
  return all;
}

// Spaces, tabs and the \r of a Windows line end, taken off both ends: the same characters in both languages.
const trim = (text: string) => text.replace(/^[ \t\r]+|[ \t\r]+$/g, "");

// The fields of a line, or null for a line with no row in it: a blank line, a # comment or the header.
function split(line: string): string[] | null {
  const text = trim(line);
  if (!text || text.startsWith("#") || text.toLowerCase().startsWith("time,")) return null;
  return text.split(",");
}

// At most 10 lines of a list, and how many more there are.
function some(list: string[], none: string): string {
  if (!list.length) return none;
  return [...list.slice(0, 10), ...(list.length > 10 ? [`and ${list.length - 10} more`] : [])].join("\n");
}

// A number with at most two decimals, such as 42 or 42.5, in hundredths: 4200, 4250. null for anything else.
function hundredths(text: string): number | null {
  if (!/^[0-9]{1,9}(\.[0-9]{1,2})?$/.test(text)) return null;
  const [whole, part = ""] = text.split(".");
  return Number(whole) * 100 + Number(part.padEnd(2, "0"));
}

// Why a line's fields can not be trusted, or null when they look right: a time, a host, a metric and a value.
function problem(fields: string[]): string | null {
  if (fields.length !== 4) return "not 4 fields";
  if (hundredths(fields[3]) === null) return "bad value";
  return null;
}

// Read one file's lines and keep their rows.
function load(name: string): string {
  const all = lines(name);
  const kept = rows.length;
  for (let i = 0; i < all.length; i++) {
    const fields = split(all[i]);
    if (!fields) continue;
    const why = problem(fields);
    if (why) bad.push(`${name} line ${i + 1}: ${why}: ${trim(all[i])}`);
    else rows.push(fields);
  }
  return `${name}: lines ${all.length}, rows ${rows.length - kept}`;
}

function run(): string {
  const names = inbox();
  rows = [];
  bad = [];
  for (const name of names) console.log(load(name));
  return `run: files ${names.length}, rows ${rows.length}`;
}

// The prompt pipe> shows only when you type at a terminal, not when another program sends the commands.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("pipe> ");
}

// Do one command, its name and then its words, and give back the answer.
function command(words: string[]): string {
  const [name] = words;
  if (name === "files") {
    const names = inbox();
    if (!names.length) return "(no CSV files in the inbox folder)";
    return names.map((name) => `${name}: lines ${lines(name).length}`).join("\n");
  }
  if (name === "run") return run();
  if (name === "rows") return some(rows.map((fields) => fields.join(" | ")), "(no rows)");
  if (name === "bad") return some(bad, "(no bad lines)");
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
