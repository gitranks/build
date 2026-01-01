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
    add("end", "the end")
    return tokens


# The parser reads the tokens into a tree. binary reads an operand, then each operator with the operand after it.
# Each level of operators has its own function, the loosest first: in 2 + 3 * 4, 3 * 4 is one operand of the +.
# tokens[0] is the token at hand, and tokens.pop(0) takes it off the list.
def parse(tokens):
    def binary(ops, operand):
        left = operand()
        while tokens[0].kind in ops:
            left = Node(kind="binary", op=tokens.pop(0).kind, left=left, right=operand())
        return left
    def expression():
        return binary(["+", "-"], factor)
    def factor():
        return binary(["*", "/"], primary)
    def primary():
        token = tokens.pop(0)
        if token.kind == "number":
            return Node(kind="value", value=number(token.text))
        raise MiniError(f"expected a value but found {token.text}")
    return expression()


# Work out the value of a node of the tree.
def evaluate(node):
    if node.kind == "value":
        return node.value
    return operate(node.op, evaluate(node.left), evaluate(node.right))


# Say what went wrong. A mistake in the program is not a crash of mini: anything else is.
def report(error):
    if not isinstance(error, MiniError):
        raise error
    print(f"error: {error}")


# Run a line that was typed, and say what went wrong if anything did: a mistake does not stop mini.
def attempt(line):
    try:
        print(evaluate(parse(tokenize(line))))
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
