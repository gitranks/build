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

// A clean row: its time in seconds since 1970 in UTC, its host and metric, and its value in hundredths.
type Row = { time: number; host: string; metric: string; value: number };

// A window: the rows of one metric on one host in one minute. Their count, sum, smallest and largest value.
type Window = { count: number; sum: number; min: number; max: number };

// The store: each window by its key, which is the metric, the host and the minute's first second.
const store = {
  windows: {} as Record<string, Window>,
};

let rows: Row[] = []; // the rows the last run kept
let bad: string[] = []; // the lines it dropped, and why
let seen = new Set<string>(); // the time, host and metric of each row it kept

// The names of the CSV files in the inbox folder, in order.
function inbox(): string[] {
  if (!fs.existsSync("inbox")) return [];
  return fs.readdirSync("inbox").filter((name) => name.endsWith(".csv")).sort();
}

// A file's whole lines. A last piece with no line end may still be being written, so it waits for a later run.
function lines(name: string): string[] {
  // A file saved by Excel may start with an invisible byte order mark, U+FEFF: it is not part of the first line.
  const all = fs.readFileSync(`inbox/${name}`, "utf8").replace(/^\uFEFF/, "").split("\n");
  all.pop();
  return all;
}

// Spaces, tabs and the \r of a Windows line end, taken off both ends: the same characters in both languages.
const trim = (text: string) => text.replace(/^[ \t\r]+|[ \t\r]+$/g, "");

// The fields of a line, or null for a line with no row in it: a blank line, a # comment or the header.
function split(line: string): string[] | null {
  const text = trim(line);
  if (!text || text.startsWith("#") || text.toLowerCase().startsWith("time,")) return null;
  return text.split(",").map(trim);
}

// At most 10 lines of a list, and how many more there are.
function some(list: string[], none: string): string {
  if (!list.length) return none;
  return [...list.slice(0, 10), ...(list.length > 10 ? [`and ${list.length - 10} more`] : [])].join("\n");
}

// A time such as 2026-11-27T10:00:05Z in seconds since 1970, or null when it is not a real time from 2000 to 2099.
// A time in another zone, such as 2026-11-27 12:00:05+02:00, is moved to UTC. A time with no zone is not trusted.
function seconds(text: string): number | null {
  const m = /^(20[0-9]{2})-([0-9]{2})-([0-9]{2})[T ]([0-9]{2}):([0-9]{2}):([0-9]{2})(Z|[+-][0-9]{2}:[0-9]{2})$/.exec(text);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null;
  if (m[7] === "Z") return date.getTime() / 1000;
  const shift = (Number(m[7].slice(1, 3)) * 60 + Number(m[7].slice(4))) * 60;
  return date.getTime() / 1000 + (m[7][0] === "+" ? -shift : shift);
}

// A number with at most two decimals, such as 42 or 42.5, in hundredths: 4200, 4250. null for anything else.
function hundredths(text: string): number | null {
  if (!/^[0-9]{1,9}(\.[0-9]{1,2})?$/.test(text)) return null;
  const [whole, part = ""] = text.split(".");
  return Number(whole) * 100 + Number(part.padEnd(2, "0"));
}

// Check a line's fields and clean them: a clean row, or why the line is dropped.
function clean(fields: string[]): Row | string {
  if (fields.length !== 4) return "not 4 fields";
  const [time, host, metric, value] = [seconds(fields[0]), fields[1].toLowerCase(), fields[2].toLowerCase(), hundredths(fields[3])];
  if (time === null) return "bad time";
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(host)) return "bad host";
  if (!/^[a-z][a-z0-9_]*$/.test(metric)) return "bad metric";
  if (value === null) return "bad value";
  if (seen.has(`${time} ${host} ${metric}`)) return "duplicate";
  seen.add(`${time} ${host} ${metric}`);
  return { time, host, metric, value };
}

// A time as 2026-11-27 10:00:05, and a value in hundredths as 42.5.
const when = (time: number) => new Date(time * 1000).toISOString().slice(0, 19).replace("T", " ");
const number = (value: number) => `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`.replace(/\.?0+$/, "");

// Add a row to the window of its minute. The minute's first second is the row's time, rounded down to 60.
function add(row: Row): void {
  const key = `${row.metric} ${row.host} ${row.time - (row.time % 60)}`;
  const w = (store.windows[key] ??= { count: 0, sum: 0, min: row.value, max: row.value });
  w.count += 1;
  w.sum += row.value;
  w.min = Math.min(w.min, row.value);
  w.max = Math.max(w.max, row.value);
}

// Read one file's lines and keep their rows.
function load(name: string): string {
  const all = lines(name);
  const [kept, dropped] = [rows.length, bad.length];
  for (let i = 0; i < all.length; i++) {
    const fields = split(all[i]);
    if (!fields) continue;
    const row = clean(fields);
    if (typeof row === "string") bad.push(`${name} line ${i + 1}: ${row}: ${trim(all[i])}`);
    else {
      rows.push(row);
      add(row);
    }
  }
  return `${name}: lines ${all.length}, kept ${rows.length - kept}, dropped ${bad.length - dropped}`;
}

function run(): string {
  const names = inbox();
  rows = [];
  bad = [];
  seen = new Set();
  store.windows = {}; // each run counts every file again
  for (const name of names) console.log(load(name));
  return `run: files ${names.length}, kept ${rows.length}, dropped ${bad.length}, windows ${Object.keys(store.windows).length}`;
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
  if (name === "rows") return some(rows.map((r) => `${when(r.time)} ${r.host} ${r.metric} ${number(r.value)}`), "(no rows)");
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
