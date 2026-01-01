# pipe: a small data pipeline, written from nothing, with no library.
# It reads the CSV files in its inbox, cleans their rows, counts them minute by minute and answers questions.
# Start it with: python pipe.py
from datetime import datetime, timezone
import os
import re
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")

# The commands pipe knows, as help shows them.
HELP = [
    "files                         list the CSV files in the inbox folder",
    "run                           read every file in the inbox",
    "rows                          show the rows the last run kept, 10 at most",
    "bad                           show the lines the last run dropped and why, 10 at most",
    "help                          this list",
    "exit                          stop pipe",
]

rows = []  # the rows the last run kept
BLANKS = " \t\r"  # spaces, tabs and the \r of a Windows line end: what strip takes off, as in TypeScript
bad = []  # the lines it dropped, and why


# The names of the CSV files in the inbox folder, in order.
def inbox():
    if not os.path.exists("inbox"):
        return []
    return sorted(name for name in os.listdir("inbox") if name.endswith(".csv"))


# A file's whole lines. A last piece with no line end may still be being written, so it waits for a later run.
def lines(name):
    with open(os.path.join("inbox", name), encoding="utf-8", errors="replace", newline="") as file:
        return file.read().split("\n")[:-1]


# The fields of a line, or None for a line with no row in it: a blank line, a # comment or the header.
def split(line):
    text = line.strip(BLANKS)
    if not text or text.startswith("#") or text.lower().startswith("time,"):
        return None
    return text.split(",")


# At most 10 lines of a list, and how many more there are.
def some(lines, none):
    if not lines:
        return none
    return "\n".join(lines[:10] + ([f"and {len(lines) - 10} more"] if len(lines) > 10 else []))


# A time such as 2026-11-27T10:00:05Z in seconds since 1970, or None when it is not a real time from 2000 to 2099.
def seconds(text):
    m = re.fullmatch(r"(20[0-9]{2})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z", text)
    if not m:
        return None
    try:
        return int(datetime(*map(int, m.groups()), tzinfo=timezone.utc).timestamp())
    except ValueError:  # not a real time, such as 31 November or 24:00
        return None


# A number with at most two decimals, such as 42 or 42.5, in hundredths: 4200, 4250. None for anything else.
def hundredths(text):
    if not re.fullmatch(r"[0-9]{1,9}(\.[0-9]{1,2})?", text):
        return None
    whole, _, part = text.partition(".")
    return int(whole) * 100 + int(part.ljust(2, "0"))


# Why a line's fields can not be trusted, or None when they look right: a time, a host, a metric and a value.
def problem(fields):
    if len(fields) != 4:
        return "not 4 fields"
    if seconds(fields[0]) is None:
        return "bad time"
    return "bad value" if hundredths(fields[3]) is None else None


# Read one file's lines and keep their rows.
def load(name):
    every = lines(name)
    kept, dropped = len(rows), len(bad)
    for i in range(len(every)):
        fields = split(every[i])
        if not fields:
            continue
        why = problem(fields)
        if why:
            bad.append(f"{name} line {i + 1}: {why}: {every[i].strip(BLANKS)}")
        else:
            rows.append(fields)
    return f"{name}: lines {len(every)}, kept {len(rows) - kept}, dropped {len(bad) - dropped}"


def run():
    names = inbox()
    rows.clear()
    bad.clear()
    for name in names:
        print(load(name))
    return f"run: files {len(names)}, kept {len(rows)}, dropped {len(bad)}"


# Do one command, its name and then its words, and give back the answer.
def command(words):
    name = words[0]
    if name == "files":
        names = inbox()
        if not names:
            return "(no CSV files in the inbox folder)"
        return "\n".join(f"{name}: lines {len(lines(name))}" for name in names)
    if name == "run":
        return run()
    if name == "rows":
        return some([" | ".join(fields) for fields in rows], "(no rows)")
    if name == "bad":
        return some(bad, "(no bad lines)")
    if name == "help":
        return "\n".join(HELP)
    return f"unknown command: {name}. Type help for the list."


print("pipe: ready. Type help for the commands.")
while True:
    try:
        # The prompt pipe> shows only when you type at a terminal, not when another program sends the commands.
        line = input("pipe> " if sys.stdin.isatty() else "")
    except EOFError:  # the input has ended
        break
    words = line.split()
    if words[:1] == ["exit"]:
        break
    if words:
        print(command(words))
