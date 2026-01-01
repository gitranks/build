# pipe: a small data pipeline, written from nothing, with no library.
# It reads the CSV files in its inbox, cleans their rows, counts them minute by minute and answers questions.
# Start it with: python pipe.py
from collections import namedtuple
from datetime import datetime, timezone
import os
import re
import sys
import time

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


# A clean row: its time in seconds since 1970 in UTC, its host and metric, and its value in hundredths.
Row = namedtuple("Row", "time host metric value")

rows = []  # the rows the last run kept
BLANKS = " \t\r"  # spaces, tabs and the \r of a Windows line end: what strip takes off, as in TypeScript
bad = []  # the lines it dropped, and why
seen = set()  # the time, host and metric of each row it kept


# The names of the CSV files in the inbox folder, in order.
def inbox():
    if not os.path.exists("inbox"):
        return []
    return sorted(name for name in os.listdir("inbox") if name.endswith(".csv"))


# A file's whole lines. A last piece with no line end may still be being written, so it waits for a later run.
def lines(name):
    # A file saved by Excel may start with an invisible byte order mark, U+FEFF: utf-8-sig takes it off.
    with open(os.path.join("inbox", name), encoding="utf-8-sig", errors="replace", newline="") as file:
        return file.read().split("\n")[:-1]


# The fields of a line, or None for a line with no row in it: a blank line, a # comment or the header.
def split(line):
    text = line.strip(BLANKS)
    if not text or text.startswith("#") or text.lower().startswith("time,"):
        return None
    return [field.strip(BLANKS) for field in text.split(",")]


# At most 10 lines of a list, and how many more there are.
def some(lines, none):
    if not lines:
        return none
    return "\n".join(lines[:10] + ([f"and {len(lines) - 10} more"] if len(lines) > 10 else []))


# A time such as 2026-11-27T10:00:05Z in seconds since 1970, or None when it is not a real time from 2000 to 2099.
# A time in another zone, such as 2026-11-27 12:00:05+02:00, is moved to UTC. A time with no zone is not trusted.
def seconds(text):
    m = re.fullmatch(r"(20[0-9]{2})-([0-9]{2})-([0-9]{2})[T ]([0-9]{2}):([0-9]{2}):([0-9]{2})(Z|[+-][0-9]{2}:[0-9]{2})", text)
    if not m:
        return None
    try:
        utc = int(datetime(*map(int, m.groups()[:6]), tzinfo=timezone.utc).timestamp())
    except ValueError:  # not a real time, such as 31 November or 24:00
        return None
    if m[7] == "Z":
        return utc
    shift = (int(m[7][1:3]) * 60 + int(m[7][4:])) * 60
    return utc - shift if m[7][0] == "+" else utc + shift


# A number with at most two decimals, such as 42 or 42.5, in hundredths: 4200, 4250. None for anything else.
def hundredths(text):
    if not re.fullmatch(r"[0-9]{1,9}(\.[0-9]{1,2})?", text):
        return None
    whole, _, part = text.partition(".")
    return int(whole) * 100 + int(part.ljust(2, "0"))


# Check a line's fields and clean them: a clean row, or why the line is dropped.
def clean(fields):
    if len(fields) != 4:
        return "not 4 fields"
    utc, host, metric, value = seconds(fields[0]), fields[1].lower(), fields[2].lower(), hundredths(fields[3])
    if utc is None:
        return "bad time"
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]*", host):
        return "bad host"
    if not re.fullmatch(r"[a-z][a-z0-9_]*", metric):
        return "bad metric"
    if value is None:
        return "bad value"
    if f"{utc} {host} {metric}" in seen:
        return "duplicate"
    seen.add(f"{utc} {host} {metric}")
    return Row(utc, host, metric, value)


# A time as 2026-11-27 10:00:05, and a value in hundredths as 42.5.
def when(utc):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(utc))


def number(value):
    return re.sub(r"\.?0+$", "", f"{value // 100}.{value % 100:02d}")


# Read one file's lines and keep their rows.
def load(name):
    every = lines(name)
    kept, dropped = len(rows), len(bad)
    for i in range(len(every)):
        fields = split(every[i])
        if not fields:
            continue
        row = clean(fields)
        if isinstance(row, str):
            bad.append(f"{name} line {i + 1}: {row}: {every[i].strip(BLANKS)}")
        else:
            rows.append(row)
    return f"{name}: lines {len(every)}, kept {len(rows) - kept}, dropped {len(bad) - dropped}"


def run():
    names = inbox()
    rows.clear()
    bad.clear()
    seen.clear()
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
        return some([f"{when(r.time)} {r.host} {r.metric} {number(r.value)}" for r in rows], "(no rows)")
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
