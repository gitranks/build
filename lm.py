# lm: a tiny language model, written from nothing, with no library.
# It reads a text, learns which character comes next, and writes text of its own. Start it with: python lm.py
import os
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")

# The commands lm knows, as help shows them.
HELP = [
    "text                  what lm read, and what it kept",
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

# Run one command, its name and then its words, and give back the answer.
def run(words):
    name = words[0]
    if name == "text":
        return f"lm read {len(raw)} characters and kept {len(text)}"
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
