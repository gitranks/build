// The quiet check of a step: it starts pipe a few times, each time in a folder of its own whose inbox holds CSV
// files made from the seed, sends it commands and prints what pipe answered. It decides nothing: GitRanks compares
// the print with what it expects.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const step = process.argv[2] ?? "";
let n = 1;
for (const ch of process.argv[3] ?? "1") n = (n * 31 + ch.charCodeAt(0)) % 2147483647;
const pick = (list) => list[(n = (n * 48271) % 2147483647 || 1) % list.length];
const said = []; // each line to print, with the step it is about, or "always"
const folder = fs.mkdtempSync(join(tmpdir(), "pipe-check-"));
const PIPE = resolve("pipe.ts");
// A zone far from UTC: pipe must never use the machine's zone, and here it would show.
const ENV = { ...process.env, TZ: "Asia/Kathmandu" };
const cut = (line) => line.replace(/(['"])[^'"]*[\\/]([^\\/'"]*)\1/g, "$1$2$1").replace(/(?:[A-Za-z]:)?[\\/]\S*[\\/]([^\\/\s]+)/g, "$1");

// A folder of its own for pipe, with these files in its inbox, each written byte for byte. null: no inbox at all.
function box(name, files) {
  const dir = join(folder, name);
  fs.mkdirSync(files ? join(dir, "inbox") : dir, { recursive: true });
  for (const [file, text] of Object.entries(files ?? {})) fs.writeFileSync(join(dir, "inbox", file), text);
  return dir;
}

// Start pipe once in a folder, send it these commands, and keep what it printed. All the runs together get 20
// seconds at most, and a pipe that does not stop ends the check there: the next runs would wait for it too.
const deadline = Date.now() + 20000;
let stopped = false;
function session(about, dir, commands) {
  if (stopped) return;
  const timeout = Math.min(5000, deadline - Date.now());
  if (timeout < 500) {
    stopped = true;
    return said.push(["always", "the check ran out of time: pipe took too long to answer"]);
  }
  said.push([about, `sent: ${commands.join(" | ") || "nothing"}`]);
  const input = commands.map((command) => command + "\n").join("");
  const run = spawnSync(process.execPath, [PIPE], { cwd: dir, input, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024, env: ENV });
  // What pipe printed but its greeting, 10 lines at most: a pipe that prints without end must not flood the check.
  const printed = (run.stdout ?? "").split("\n").filter((line) => line.trim() && line !== "pipe: ready. Type help for the commands.");
  for (const line of printed.slice(0, 10)) said.push([about, line.trimEnd()]);
  if (printed.length > 10) said.push([about, `and ${printed.length - 10} more lines`]);
  // A crash's line, with each path in it cut to its file's name. A crash ends the check: the next runs would crash too.
  const crash = (run.stderr ?? "").split("\n").find((line) => /^[A-Za-z]*Error\b/.test(line));
  if (crash) said.push(["always", `pipe crashed: ${cut(crash.trim())}`]);
  stopped = Boolean(crash);
  // ETIMEDOUT with a status: pipe ended, but a program it started kept its output open. That hangs too.
  if (run.status === null || run.error?.code === "ETIMEDOUT") {
    stopped = true;
    said.push(["always", "pipe did not stop when its input ended, so the check stopped there"]);
  } else if (run.status !== 0) said.push([run.status === 3 ? about : "always", `pipe stopped with code ${run.status}`]);
}

session("what-you-will-build", box("start", {}), []);
session("read-commands", box("commands", {}), ["help", "", pick(["fly", "hello", "remember"]) + " away", "exit", "help"]);
session("list-the-inbox", box("no-inbox", null), ["files"]);
const name = pick(["web", "api", "db"]);
const listed = { [`${name}.csv`]: "one\ntwo\nthree\n", "2026-11-27.csv": "first\r\nsecond, with no line end yet", "notes.txt": "not a CSV file\n" };
session("list-the-inbox", box("listed", listed), ["files"]);
const day = pick(["2026-11-27", "2026-03-01", "2025-12-31"]);
const host = pick(["web-1", "web-2", "db-1"]);
const other = host === "db-1" ? "web-1" : "db-1";
const metric = pick(["cpu", "mem"]);
const at = (time) => `${day}T${time}Z`;
const row = (...fields) => fields.join(",");
const csv = (lines, end = "\n") => lines.map((line) => line + end).join("");
const v = () => pick(["12", "40.5", "7", "93.25", "61"]);
const first = csv([`# ${metric} of ${host}`, "time,host,metric,value", row(at("10:00:05"), host, metric, v()), "", row(at("10:00:35"), host, metric, v())], "\r\n");
session("read-the-rows", box("rows", { "a.csv": first, "b.csv": csv([row(at("10:01:05"), other, metric, v())]) }), ["run", "run"]);
const shown = csv(["TIME,HOST,METRIC,VALUE", row(at("10:02:05"), host, metric, v()) + ", "]);
session("show-the-rows", box("show", { "a.csv": first + shown }), ["rows", "run", "rows"]);
const fields = pick(["web-1,cpu", "only one field", `${host},${metric},1,2`]);
const value = pick(["n/a", "-3", "12.345", "1e3", ""]);
const checked = [row(at("10:00:05"), host, metric, v()), "", `${at("10:00:15")},${fields}`, row(at("10:00:25"), host, metric, value), row(at("10:00:35"), host, metric, pick(["0.5", "100", "3.10"]))];
session("check-each-row", box("check", { "a.csv": csv(checked) }), ["bad", "run", "bad"]);
const times = [
  pick(["2026-02-30T10:00:00Z", "2026-04-31T10:00:00Z", "2025-02-29T10:00:00Z"]),
  pick(["2026-11-27T10:60:00Z", "2026-11-27T10:00:60Z"]),
  pick(["1999-12-31T23:59:59Z", "2100-01-01T00:00:00Z", "1970-01-01T00:00:00Z"]),
  pick(["2026-11-27T10:00:05", "27/11/2026 10:00:05", "1764237605"]),
  "2028-02-29T10:00:00Z",
];
session("check-the-times", box("times", { "a.csv": csv(times.map((time) => row(time, host, metric, v()))) }), ["run", "bad"]);
const values = [pick(["007", "0042.0"]), pick(["42.5", "0.05", "3.10"]), pick(["100.00", "999999999.99", "0"])];
session("clean-the-values", box("clean", { "a.csv": csv(values.map((x, i) => row(at(`10:00:0${i + 5}`), host, metric, x))) }), ["run", "rows"]);
try {
  fs.rmSync(folder, { recursive: true, force: true });
} catch {}

// What this step adds is printed whole. Every other line goes into one line with a fingerprint (a hash), so the
// print stays short. With --all, every line is printed, after a first line that says this print is only to look at.
const every = process.argv[4] === "--all";
const visible = ([about]) => every || about === "always" || about === step;
if (every) console.log("all lines, printed with --all: never send this print, send the one without --all");
for (const line of said) if (visible(line)) console.log(line[1]);
const folded = said.filter((line) => !visible(line)).map(([, text]) => text);
if (folded.length) {
  const digest = createHash("sha256").update(folded.join("\n"), "utf8").digest("hex").slice(0, 8);
  console.log(`${folded.length} more lines (earlier steps' answers and the logs), fingerprint ${digest}: to see them, add --all at the end of the check command`);
}
