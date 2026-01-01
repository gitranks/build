# The quiet check of a step: it starts mini a few times, each time with lines of mini made from the seed, and prints
# what mini answered. It decides nothing: GitRanks compares the print with what it expects.
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
folder = tempfile.mkdtemp(prefix="mini-check-")

# Start mini once, send it these lines (or give it a file), and keep what it printed. All the sessions together get
# 20 seconds at most, and a mini that does not stop ends the check there: the next sessions would wait for it too.
deadline = time.monotonic() + 20
stopped = False


def session(about, lines, file=False):
    global stopped
    if stopped:
        return
    timeout = min(5, deadline - time.monotonic())
    if timeout < 0.5:
        stopped = True
        said.append(("always", "the check ran out of time: mini took too long to answer"))
        return
    said.append((about, ("ran the file: " + " | ".join(lines)) if file else "sent: " + (" | ".join(lines) or "nothing")))
    args = [sys.executable, "mini.py"]
    if file:
        with open(os.path.join(folder, "program.mini"), "w", encoding="utf-8", newline="\n") as program:
            program.write("".join(line + "\n" for line in lines))
        args.append(os.path.join(folder, "program.mini"))
    sent = b"" if file else "".join(line + "\n" for line in lines).encode()
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    # Files, not pipes: a program mini started and left running can not keep the check waiting.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            code = subprocess.run(args, input=sent, stdout=out, stderr=err, timeout=timeout, env=env).returncode
        except subprocess.TimeoutExpired:
            code = None
        out.seek(0)
        err.seek(0)
        stdout, stderr = out.read().decode("utf-8", "replace"), err.read().decode("utf-8", "replace")
    # What mini printed, 10 lines at most: a mini that prints without end must not flood the check.
    printed = [line.rstrip() for line in stdout.splitlines() if line.strip()]
    said.extend((about, line) for line in printed[:10])
    if len(printed) > 10:
        said.append((about, f"and {len(printed) - 10} more lines"))
    # A crash's line, with each path in it cut to its file's name. A crash ends the check: the next runs would crash too.
    crash = [line for line in stderr.splitlines() if line[:1].isalpha() and "Error" in line.split(":")[0]]
    if crash:
        line = re.sub(r"""(['"])[^'"]*[\\/]([^\\/'"]*)\1""", r"\1\2\1", crash[-1].strip())
        said.append(("always", "mini crashed: " + re.sub(r"(?:[A-Za-z]:)?[\\/]\S*[\\/]([^\\/\s]+)", r"\1", line)))
        stopped = True
    if code is None:
        stopped = True
        said.append(("always", "mini did not stop when its input ended, so the check stopped there"))
    elif code != 0:
        said.append((about if file and code == 1 else "always", f"mini stopped with code {code}"))


session("what-you-will-build", [])
session("read-lines", [pick(["hello", "good morning", "hi there"]), "", "   " + pick(["mini", "one  two", "x"]) + "  ", "exit", "after exit"])
a = pick([12, 30, 45, 7])
b = pick([3, 4, 5])
session("whole-numbers", [f"{a}", " 00" + str(b), pick(["twelve", "4x", "1.5", "-3"]), f"{a} {b}"])
session("do-arithmetic", [f"{a} + {b} - 1", pick(["7 / 2", "17 / 5", "29 / 4"]), "2 + 3 * 4", f"{a} / 0", f"{a} +", f"{a} {pick(['x', 'plus', '^'])} {b}"])
session("cut-into-tokens", [f"{a}+{b}", f"{a}*{b}-{b}", f"{a} {pick(['@', '?', '&'])} {b}", f"{a} {b}"])
session("build-a-tree", ["2 + 3 * 4", f"{a} - {b} * 2 - 1", f"{a} / {b} * {b}", f"* {a}", f"{a} -"])
shutil.rmtree(folder, ignore_errors=True)

# What this step adds is printed whole. Every other line goes into one line with a fingerprint (a hash), so the
# print stays short. With --all, every line is printed, after a first line that says this print is only to look at.
every = sys.argv[3:4] == ["--all"]
shown = [text for about, text in said if every or about in ("always", step)]
other = [text for about, text in said if not (every or about in ("always", step))]
if every:
    print("all lines, printed with --all: never send this print, send the one without --all")
for text in shown:
    print(text)
if other:
    digest = hashlib.sha256("\n".join(other).encode()).hexdigest()[:8]
    print(f"{len(other)} more lines (earlier steps' answers and the logs), fingerprint {digest}: to see them, add --all at the end of the check command")
