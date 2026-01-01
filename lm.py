# lm: a tiny language model, written from nothing, with no library.
# It reads a text, learns which character comes next, and writes text of its own. Start it with: python lm.py
import os
import re
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")

# The commands lm knows, as help shows them.
HELP = [
    "text                  what lm read, and what it kept",
    "encode <text>         turn text into numbers, one for each character",
    "decode <numbers>      turn numbers back into text",
    "counts <character>    the characters that came after this one, and how often",
    "write <start>         go on from the start, one character at a time",
    "seed <number>         start the random numbers again from this number",
    "help                  this list",
    "exit                  stop lm",
]

# The text lm learns from. --text picks another file.
FILE = sys.argv[sys.argv.index("--text") + 1] if "--text" in sys.argv[1:-1] else "text.txt"

# Clean a text: small letters, full stops and commas stay, each run of spaces and line ends becomes one space, and
# every other character goes.
KEEP = "abcdefghijklmnopqrstuvwxyz.,"

def clean(raw):
    out = ""
    for ch in raw.lower():
        if ch in KEEP:
            out += ch
        elif ch in " \t\r\n" and out and not out.endswith(" "):
            out += " "
    return out.rstrip(" ")

if not os.path.exists(FILE):
    print(f"lm: there is no {FILE} to read")
    sys.exit(1)
with open(FILE, encoding="utf-8", errors="replace", newline="") as file:
    raw = file.read()
text = clean(raw)
if len(text) < 100 or len(set(text)) < 2:
    print("lm: the text is too short: it needs 100 characters or more after cleaning, of two kinds at least")
    sys.exit(1)

# The alphabet: each character of the text once, in order. A character's number is its place in the alphabet.
ALPHABET = "".join(sorted(set(text)))
V = len(ALPHABET)

def encode(part):
    return [ALPHABET.index(ch) for ch in part]

def decode(numbers):
    return "".join(ALPHABET[n] for n in numbers)

def show(n):
    return f'"{ALPHABET[n]}"'

# The text as numbers.
ids = encode(text)

# pairs[a][b]: how many times character b came right after character a.
pairs = [[0] * V for _ in range(V)]
for i in range(len(ids) - 1):
    pairs[ids[i]][ids[i + 1]] += 1
SMOOTH = 0.1  # a pair never seen still gets a small count, so it is unlikely, not impossible

# Random numbers from a seed: the same seed gives the same numbers, on every computer and in both languages.
state = 1

def random():
    global state
    state = state * 48271 % 2147483647
    return state / 2147483647

# Pick a place at random, each as likely as its weight.
def pick(weights):
    total = 0
    for w in weights:
        total += w
    r = random() * total
    for i, w in enumerate(weights):
        r -= w
        if r < 0:
            return i
    return len(weights) - 1

# Go on from the start, one character at a time, each picked at random by how often it came next.
LENGTH = 60

def write(start):
    out = list(start)
    while len(out) < len(start) + LENGTH:
        out.append(pick([count + SMOOTH for count in pairs[out[-1]]]))
    return decode(out)

# A whole number, such as 42.
def is_number(word):
    return re.fullmatch(r"[0-9]{1,9}", word) is not None

# Run one command, its name and then its words, and give back the answer.
def run(words):
    global state
    name, rest = words[0], words[1:]
    arg = " ".join(rest)
    if name == "text":
        return f"lm read {len(raw)} characters and kept {len(text)}"
    if name == "encode":
        if not arg:
            return "usage: encode <text>"
        missing = [ch for ch in arg if ch not in ALPHABET]
        if missing:
            return f'not in the alphabet: "{missing[0]}". The alphabet is "{ALPHABET}"'
        return " ".join(str(n) for n in encode(arg))
    if name == "decode":
        if not rest or not all(is_number(w) and int(w) < V for w in rest):
            return f"usage: decode <numbers>, each from 0 to {V - 1}"
        return f'"{decode(int(w) for w in rest)}"'
    if name == "counts":
        a = ALPHABET.find(arg)
        if len(arg) != 1 or a < 0:
            return f'usage: counts <character>, one of "{ALPHABET}"'
        order = [[count, b] for b, count in enumerate(pairs[a]) if count > 0]
        order.sort(key=lambda each: -each[0])
        total = 0
        for count, _ in order:
            total += count
        if not total:
            return f'nothing came after "{arg}"'
        top = ", ".join(f"{show(b)} {count}" for count, b in order[:5])
        return f'after "{arg}": {top}' + (f" and {len(order) - 5} more" if len(order) > 5 else "") + f", {total} in all"
    if name == "seed":
        if not is_number(arg):
            return "usage: seed <number>"
        state = int(arg) % 2147483646 + 1
        return f"seed {int(arg)}"
    if name == "write":
        if not arg:
            return "usage: write <start>"
        start = clean(arg)
        missing = [ch for ch in start if ch not in ALPHABET]
        if not start or missing:
            return f'not in the alphabet: "{missing[0] if missing else arg}"'
        return write(encode(start))
    if name == "help":
        return "\n".join(HELP)
    return f"unknown command: {name}. Type help for the list."

print("lm: ready. Type help for the commands.")
while True:
    try:
        # The prompt lm> shows only when you type at a terminal, not when another program sends the commands.
        line = input("lm> " if sys.stdin.isatty() else "")
    except EOFError:  # the input has ended
        break
    words = [word for word in line.replace("\t", " ").split(" ") if word]
    if words[:1] == ["exit"]:
        break
    if words:
        print(run(words))
