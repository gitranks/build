# mini: a small programming language and its interpreter, written from nothing, with no library.
# You type a line of mini, such as 1 + 2 * 3, and it answers 7. Start it with: python mini.py
import re
import sys
from types import SimpleNamespace as Token  # a token: Token(kind="number", text="12")
Node = Token  # and a node of a tree is made the same way: Node(kind="binary", op="+", left=..., right=...)

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")


# A mistake in the program mini runs, such as 1 / 0: mini says what it is and goes on. It is not a crash of mini.
class MiniError(Exception):
    pass


# A number, from its digits.
def number(text):
    if not re.fullmatch("[0-9]+", text):
        raise MiniError(f"{text} is not a number")
    return int(text)


# Work out one operator on two values.
def operate(op, a, b):
    if op == "+":
        return a + b
    if op == "-":
        return a - b
    if op == "*":
        return a * b
    if b == 0:
        raise MiniError("division by zero")
    return a // b  # a whole number, rounded down: 7 / 2 is 3


# Work out words such as 12 + 30 - 2: a number, then an operator and a number, again and again, from left to right.
def calculate(words):
    total = number(words[0])
    for i in range(1, len(words), 2):
        op = words[i]
        if op not in ["+", "-", "*", "/"]:
            raise MiniError(f"{op} is not an operator")
        if i + 1 == len(words):
            raise MiniError(f"{op} needs a number after it")
        total = operate(op, total, number(words[i + 1]))
    return total


SYMBOLS = [  # the symbols mini knows
    "+", "-", "*", "/",
]


# The tokenizer cuts the source into pieces: a run of spaces, a number, a name and more, or any other one
# character. It turns each piece into a token, the words of mini, and leaves the spaces out.
PIECES = r"[ \t\r]+|[0-9]+|[\s\S]"


def tokenize(source):
    tokens = []

    def add(kind, text):
        tokens.append(Token(kind=kind, text=text))

    for piece in re.findall(PIECES, source):
        if re.match("[0-9]", piece):
            add("number", piece)
        elif piece in SYMBOLS:
            add(piece, piece)
        elif piece[0] not in " \t\r":
            raise MiniError(f"unexpected character {piece}")
    return tokens


# Say what went wrong. A mistake in the program is not a crash of mini: anything else is.
def report(error):
    if not isinstance(error, MiniError):
        raise error
    print(f"error: {error}")


# Run a line that was typed, and say what went wrong if anything did: a mistake does not stop mini.
def attempt(line):
    try:
        print(calculate([token.text for token in tokenize(line)]))
    except Exception as error:
        report(error)


# The prompt: read a line, run it, say the answer, and again, until exit or the end of the input.
def repl():
    if sys.stdin.isatty():
        print("mini: type a line, then Enter. exit stops mini.")
    while True:
        try:
            # The prompt mini> shows only when you type at a terminal, not when another program sends the lines.
            line = input("mini> " if sys.stdin.isatty() else "")
        except EOFError:  # the input has ended
            break
        if line.strip() == "exit":
            break
        if line.strip():
            attempt(line)


repl()
