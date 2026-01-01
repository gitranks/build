# The quiet check of a step: it starts pipe a few times, each time in a folder of its own whose inbox holds CSV
# files made from the seed, sends it commands and prints what pipe answered. It decides nothing: GitRanks compares
# the print with what it expects.
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

sys.stdout.reconfigure(encoding="utf-8", newline="\n")
step = sys.argv[1] if len(sys.argv) > 1 else ""
n = 1
for ch in sys.argv[2] if len(sys.argv) > 2 else "1":
    n = (n * 31 + ord(ch)) % 2147483647


def pick(options):
    global n
    n = (n * 48271) % 2147483647 or 1
    return options[n % len(options)]


said = []  # each line to print, with the step it is about, or "always"
folder = tempfile.mkdtemp(prefix="pipe-check-")
PIPE = os.path.abspath("pipe.py")
# A zone far from UTC: pipe must never use the machine's zone, and here it would show.
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "TZ": "Asia/Kathmandu"}


def cut(line):
    line = re.sub(r"""(['"])[^'"]*[\\/]([^\\/'"]*)\1""", r"\1\2\1", line)
    return re.sub(r"(?:[A-Za-z]:)?[\\/]\S*[\\/]([^\\/\s]+)", r"\1", line)


# A folder of its own for pipe, with these files in its inbox, each written byte for byte. None: no inbox at all.
def box(name, files):
    path = os.path.join(folder, name)
    os.makedirs(os.path.join(path, "inbox") if files is not None else path, exist_ok=True)
    for file, text in (files or {}).items():
        with open(os.path.join(path, "inbox", file), "w", encoding="utf-8", newline="") as out:
            out.write(text)
    return path


# Run a program with this input and give back its exit code (None when it did not stop in time), its output and
# its errors. Files, not pipes: a program it started and left running can not keep the check waiting.
def start(words, cwd, sent, timeout):
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            code = subprocess.run(words, cwd=cwd, input=sent.encode(), stdout=out, stderr=err, timeout=timeout, env=ENV).returncode
        except subprocess.TimeoutExpired:
            code = None
        out.seek(0)
        err.seek(0)
        return code, out.read().decode("utf-8", "replace"), err.read().decode("utf-8", "replace")


# Start pipe once in a folder, send it these commands, and keep what it printed. All the runs together get 20
# seconds at most, and a pipe that does not stop ends the check there: the next runs would wait for it too.
deadline = time.monotonic() + 20
stopped = False


def session(about, path, commands):
    global stopped
    if stopped:
        return
    timeout = min(5, deadline - time.monotonic())
    if timeout < 0.5:
        stopped = True
        said.append(("always", "the check ran out of time: pipe took too long to answer"))
        return
    said.append((about, "sent: " + (" | ".join(commands) or "nothing")))
    code, stdout, stderr = start([sys.executable, PIPE], path, "".join(command + "\n" for command in commands), timeout)
    # What pipe printed but its greeting, 10 lines at most: a pipe that prints without end must not flood the check.
    printed = [line for line in stdout.split("\n") if line.strip() and line != "pipe: ready. Type help for the commands."]
    for line in printed[:10]:
        said.append((about, line.rstrip()))
    if len(printed) > 10:
        said.append((about, f"and {len(printed) - 10} more lines"))
    # A crash's line, with each path in it cut to its file's name. A crash ends the check: the next runs would crash too.
    crash = [line for line in stderr.splitlines() if line[:1].isalpha() and "Error" in line.split(":")[0]]
    if crash:
        said.append(("always", "pipe crashed: " + cut(crash[-1].strip())))
        stopped = True
    if code is None:
        stopped = True
        said.append(("always", "pipe did not stop when its input ended, so the check stopped there"))
    elif code != 0:
        said.append((about if code == 3 else "always", f"pipe stopped with code {code}"))


session("what-you-will-build", box("start", {}), [])
session("read-commands", box("commands", {}), ["help", "", pick(["fly", "hello", "remember"]) + " away", "exit", "help"])
session("list-the-inbox", box("no-inbox", None), ["files"])
name = pick(["web", "api", "db"])
listed = {f"{name}.csv": "one\ntwo\nthree\n", "2026-11-27.csv": "first\r\nsecond, with no line end yet", "notes.txt": "not a CSV file\n"}
session("list-the-inbox", box("listed", listed), ["files"])
day = pick(["2026-11-27", "2026-03-01", "2025-12-31"])
host = pick(["web-1", "web-2", "db-1"])
other = "web-1" if host == "db-1" else "db-1"
metric = pick(["cpu", "mem"])


def at(clock):
    return f"{day}T{clock}Z"


def row(*fields):
    return ",".join(fields)


def csv(lines, end="\n"):
    return "".join(line + end for line in lines)


def v():
    return pick(["12", "40.5", "7", "93.25", "61"])


first = csv([f"# {metric} of {host}", "time,host,metric,value", row(at("10:00:05"), host, metric, v()), "", row(at("10:00:35"), host, metric, v())], "\r\n")
session("read-the-rows", box("rows", {"a.csv": first, "b.csv": csv([row(at("10:01:05"), other, metric, v())])}), ["run", "run"])
shutil.rmtree(folder, ignore_errors=True)

# What this step adds is printed whole. Every other line goes into one line with a fingerprint (a hash), so the
# print stays short. With --all, every line is printed, after a first line that says this print is only to look at.
every = sys.argv[3:4] == ["--all"]
shown_lines = [text for about, text in said if every or about in ("always", step)]
folded = [text for about, text in said if not (every or about in ("always", step))]
if every:
    print("all lines, printed with --all: never send this print, send the one without --all")
for text in shown_lines:
    print(text)
if folded:
    digest = hashlib.sha256("\n".join(folded).encode()).hexdigest()[:8]
    print(f"{len(folded)} more lines (earlier steps' answers and the logs), fingerprint {digest}: to see them, add --all at the end of the check command")
