# lm: a tiny language model, written from nothing, with no library.
# It reads a text, learns which character comes next, and writes text of its own. Start it with: python lm.py
import math
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
    "loss                  how surprised lm is by the text: lower is better",
    "shapes                the size of each table of numbers in the model",
    "softmax <numbers>     turn scores into chances that add up to 1",
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

# exp and log from + - * / alone, so that every computer gets the very same numbers.
LN2 = 0.6931471805599453

def exp(x):
    k = math.floor(x / LN2 + 0.5)
    r = x - k * LN2  # e to the x is 2 to the k, times e to the r, and r is small
    total = 1.0
    for i in range(14, 0, -1):
        total = 1 + total * r / i
    for _ in range(abs(k)):
        total = total * 2 if k > 0 else total / 2
    return total

def log(x):
    x, k = max(x, 1e-300), 0
    while x >= 2 or x < 1:
        x, k = (x / 2, k + 1) if x >= 2 else (x * 2, k - 1)
    y = (x - 1) / (x + 1)  # x is 2 to the k, times a number from 1 to 2
    total = 0.0
    for i in range(39, 0, -2):
        total = total * y * y + 1 / i
    return k * LN2 + 2 * y * total

# A number with a fixed count of places after the point, rounded the same way in both languages.
def fmt(x, places=3):
    n = math.floor(abs(x) * 10**places + 0.5)
    digits = str(n).rjust(places + 1, "0")
    return ("-" if x < 0 and n > 0 else "") + digits[:-places] + "." + digits[-places:]

# The loss: the mean of -log(the chance the counts gave the character that came next). Lower is better.
def counts_loss(part):
    total = 0.0
    for a, b in zip(part, part[1:]):
        total -= log((pairs[a][b] + SMOOTH) / (sum(pairs[a]) + SMOOTH * V))
    return total / (len(part) - 1)

# The model's sizes: each character becomes D numbers, and the model looks back over T characters at most.
D = 16
T = 8

# A table of numbers, rows by columns, each a small random number to start from.
def matrix(rows, cols, size):
    return [[(random() * 2 - 1) * size for _ in range(cols)] for _ in range(rows)]

model = {
    "emb": matrix(V, D, 0.5),  # a row of numbers for each character
    "out": matrix(D, V, 0.5),  # from those numbers to a score for each character
}

# Scores to chances: each becomes positive, and together they add up to 1.
def softmax(scores):
    top = max(scores)
    e = [exp(s - top) for s in scores]
    total = 0.0
    for x in e:
        total += x
    return [x / total for x in e]

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

# A number that may have a point and a minus, such as -1.5.
def is_decimal(word):
    return re.fullmatch(r"-?[0-9]{1,4}(\.[0-9]{1,4})?", word) is not None

# A table's rows by columns, or "broken" when it is not a table whose rows all have the same length.
def shape(m):
    if isinstance(m, list) and m and all(isinstance(row, list) and len(row) == len(m[0]) for row in m):
        return f"{len(m)} × {len(m[0])}"
    return "broken"

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
    if name == "loss":
        return f"counts: {fmt(counts_loss(ids))}, a blind guess {fmt(log(V))}"
    if name == "shapes":
        total = 0
        for m in model.values():
            total += len(m) * len(m[0])
        return ", ".join(f"{key} {shape(m)}" for key, m in model.items()) + f": {total} numbers"
    if name == "softmax":
        if not rest or len(rest) > 12 or not all(is_decimal(w) for w in rest):
            return "usage: softmax <numbers>, such as softmax 2 1 0.5"
        return " ".join(fmt(p) for p in softmax([float(w) for w in rest]))
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
