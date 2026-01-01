# pipe: a small data pipeline, written from nothing, with no library.
# It reads the CSV files in its inbox, cleans their rows, counts them minute by minute and answers questions.
# Start it with: python pipe.py
import os
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")

# The commands pipe knows, as help shows them.
HELP = [
    "files                         list the CSV files in the inbox folder",
    "help                          this list",
    "exit                          stop pipe",
]


# The names of the CSV files in the inbox folder, in order.
def inbox():
    if not os.path.exists("inbox"):
        return []
    return sorted(name for name in os.listdir("inbox") if name.endswith(".csv"))


# A file's whole lines. A last piece with no line end may still be being written, so it waits for a later run.
def lines(name):
    with open(os.path.join("inbox", name), encoding="utf-8", errors="replace", newline="") as file:
        return file.read().split("\n")[:-1]


# Do one command, its name and then its words, and give back the answer.
def command(words):
    name = words[0]
    if name == "files":
        names = inbox()
        if not names:
            return "(no CSV files in the inbox folder)"
        return "\n".join(f"{name}: lines {len(lines(name))}" for name in names)
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
