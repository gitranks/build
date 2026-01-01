// The quiet check of a step: it starts mini a few times, each time with lines of mini made from the seed, and prints
// what mini answered. It decides nothing: GitRanks compares the print with what it expects.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const step = process.argv[2] ?? "";
let n = 1;
for (const ch of process.argv[3] ?? "1") n = (n * 31 + ch.charCodeAt(0)) % 2147483647;
const pick = (list) => list[(n = (n * 48271) % 2147483647 || 1) % list.length];
const said = []; // each line to print, with the step it is about, or "always"
const folder = fs.mkdtempSync(join(tmpdir(), "mini-check-"));

// Start mini once, send it these lines (or give it a file), and keep what it printed. All the sessions together get
// 20 seconds at most, and a mini that does not stop ends the check there: the next sessions would wait for it too.
const deadline = Date.now() + 20000;
let stopped = false;
function session(about, lines, file) {
  if (stopped) return;
  const timeout = Math.min(5000, deadline - Date.now());
  if (timeout < 500) {
    stopped = true;
    return said.push(["always", "the check ran out of time: mini took too long to answer"]);
  }
  said.push([about, file ? `ran the file: ${lines.join(" | ")}` : `sent: ${lines.join(" | ") || "nothing"}`]);
  const args = ["mini.ts"];
  if (file) {
    fs.writeFileSync(join(folder, "program.mini"), lines.map((line) => line + "\n").join(""));
    args.push(join(folder, "program.mini"));
  }
  const input = file ? "" : lines.map((line) => line + "\n").join("");
  const run = spawnSync(process.execPath, args, { input, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
  // What mini printed, 10 lines at most: a mini that prints without end must not flood the check.
  const printed = (run.stdout ?? "").split("\n").filter((line) => line.trim());
  for (const line of printed.slice(0, 10)) said.push([about, line.trimEnd()]);
  if (printed.length > 10) said.push([about, `and ${printed.length - 10} more lines`]);
  // A crash's line, with each path in it cut to its file's name. A crash ends the check: the next runs would crash too.
  const crash = (run.stderr ?? "").split("\n").find((line) => /^[A-Za-z]*Error\b/.test(line));
  const cut = (line) => line.replace(/(['"])[^'"]*[\\/]([^\\/'"]*)\1/g, "$1$2$1").replace(/(?:[A-Za-z]:)?[\\/]\S*[\\/]([^\\/\s]+)/g, "$1");
  if (crash) said.push(["always", `mini crashed: ${cut(crash.trim())}`]);
  stopped = Boolean(crash);
  if (run.status === null) {
    stopped = true;
    said.push(["always", "mini did not stop when its input ended, so the check stopped there"]);
  } else if (run.status !== 0) said.push([file && run.status === 1 ? about : "always", `mini stopped with code ${run.status}`]);
}

session("what-you-will-build", []);
session("read-lines", [pick(["hello", "good morning", "hi there"]), "", "   " + pick(["mini", "one  two", "x"]) + "  ", "exit", "after exit"]);
const a = pick([12, 30, 45, 7]);
const b = pick([3, 4, 5]);
session("whole-numbers", [`${a}`, " 00" + b, pick(["twelve", "4x", "1.5", "-3"]), `${a} ${b}`]);
session("do-arithmetic", [`${a} + ${b} - 1`, pick(["7 / 2", "17 / 5", "29 / 4"]), "2 + 3 * 4", `${a} / 0`, `${a} +`, `${a} ${pick(["x", "plus", "^"])} ${b}`]);
session("cut-into-tokens", [`${a}+${b}`, `${a}*${b}-${b}`, `${a} ${pick(["@", "?", "&"])} ${b}`, `${a} ${b}`]);
session("build-a-tree", ["2 + 3 * 4", `${a} - ${b} * 2 - 1`, `${a} / ${b} * ${b}`, `* ${a}`, `${a} -`]);
session("brackets-and-minus", [`(${a} + ${b}) * 2`, `-${a} + ${b}`, `-(${a} - ${b}) * 2`, `(${a} + 1`, `${a} ${b}`]);
const [x, y] = pick([[7, 2], [9, 4], [11, 3], [13, 5]]);
session("exact-whole-numbers", [`-${x} / ${y}`, `-${x} % ${y}`, `${x} % -${y}`, pick(["99999999 * 99999999", "9007199254740991 + 1"]), "12345678901234567890"]);
const name = pick(["x", "count", "total_2"]);
session("let-and-names", [`let ${name} = ${a} * 2`, `${name} + 1`, pick(["y", "size", "Count"]), "let = 5", `let ${pick(["7", "+"])} = 1`]);
session("change-a-variable", [`let ${name} = ${a}`, `${name} = ${name} + ${b}`, `${name}`, `${pick(["y", "size"])} = 1`]);
session("true-and-false", [`${a} < ${b}`, `${a} + 1 == ${a + 1}`, `${b} <= ${b}`, `${a} >= ${a + 1}`, "true != false", "1 == true", "true + 1", "1 < 2 < 3"]);
session("many-statements", [`let x = ${a}; print x; x = x * ${b}; print x`, "print 1 2", ";;", "print"]);
const top = pick([3, 4, 5]);
session("if-and-while", [
  `let n = ${a}; if n % 2 == 0 { print 0 } else { print 1 } print n`,
  `let i = 0; while i < ${top} { i = i + 1; if i == 2 { print 20 } else if i > 2 { print i * 100 } }`,
  "if 1 { print 1 }",
  "if true { print 1",
]);
session("text-values", [`"${pick(["hello", "mini", "Ada"])}"`, `"n = " + ${a}`, `"ab" == "a" + "b"`, '"a" * 2', `"${pick(["no end", "half"])}`, `let s = ""; let i = 0; while i < ${b} { s = s + "*"; i = i + 1 } s`]);
const fn = pick(["hello", "greet", "say_hi"]);
session("functions", [`fn ${fn}() { print "hi from ${fn}" }`, `${fn}()`, fn, `${a}()`, `${fn}(); ${fn}()`]);
session("parameters-and-scope", ["fn add(a, b) { print a + b }", `add(${a}, ${b})`, "add(1)", "a", `let k = ${b}; fn use_k(n) { print n + k } use_k(1); fn own_k() { let k = 100; print k } own_k(); k`, "let c = 0; fn inc() { c = c + 1 } inc(); inc(); c"]);
session("return-a-value", ["fn square(n) { return n * n }", `square(${a})`, "square(square(2))", "fn sign(n) { if n < 0 { return -1 } return 1 }", `sign(-${b})`, `sign(${b})`, "return 1"]);
const deep = pick([5, 10, 12]);
session("limit-the-depth", ["fn fact(n) { if n < 2 { return 1 } return n * fact(n - 1) }", `fact(${deep})`, "fn down(n) { return down(n + 1) }", "down(1)", "fact(3)"]);
const bad = pick(["c", "missing", "z"]);
session("errors-name-the-line", ["let a = 1", "let b = a +", `print ${bad}`, `fn f() { return ${bad} }`, "f()", "fn g() { return a }", `print g() + ${bad}`]);
const upto = pick([5, 6, 7]);
session("run-a-file", ["# counts with a while loop", "let i = 1", `while i <= ${upto} {`, "  if i % 3 == 0 { print \"fizz\" } else { print i }", "  i = i + 1", "}", "i"], true);
session("run-a-file", ["let a = 1", "print a", `print a + ${bad}`, "print 3"], true);
try {
  fs.rmSync(folder, { recursive: true, force: true });
} catch {}

// What this step adds is printed whole. Every other line goes into one line with a fingerprint (a hash), so the
// print stays short. With --all, every line is printed, after a first line that says this print is only to look at.
const every = process.argv[4] === "--all";
const shown = ([about]) => every || about === "always" || about === step;
if (every) console.log("all lines, printed with --all: never send this print, send the one without --all");
for (const line of said) if (shown(line)) console.log(line[1]);
const other = said.filter((line) => !shown(line)).map(([, text]) => text);
if (other.length) {
  const digest = createHash("sha256").update(other.join("\n"), "utf8").digest("hex").slice(0, 8);
  console.log(`${other.length} more lines (earlier steps' answers and the logs), fingerprint ${digest}: to see them, add --all at the end of the check command`);
}
