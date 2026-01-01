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


# Every number is whole and between -LIMIT and LIMIT, so mini gives the same answers in every language.
LIMIT = 9007199254740991  # 2 ** 53 - 1: the largest whole number a JavaScript number holds exactly


def checked(n):
    if abs(n) > LIMIT:
        raise MiniError(f"number too big: mini's numbers stop at {LIMIT}")
    return n


# A number, from its digits.
def number(text):
    return checked(LIMIT + 1 if len(text) > 16 else int(text))


# Work out one operator on two values.
def operate(op, a, b):
    if op == "==":
        return type(a) is type(b) and a == b  # in mini, 1 and true are not the same
    if op == "!=":
        return not operate("==", a, b)
    if type(a) is not int or type(b) is not int:
        raise MiniError(f"{op} needs numbers, not {show(a)} and {show(b)}")
    if op == "<":
        return a < b
    if op == "<=":
        return a <= b
    if op == ">":
        return a > b
    if op == ">=":
        return a >= b
    if op == "+":
        return checked(a + b)
    if op == "-":
        return checked(a - b)
    if op == "*":
        return checked(a * b)
    if b == 0:
        raise MiniError("division by zero")
    if op == "/":
        return a // b  # a whole number, rounded down: 7 / 2 is 3, and -7 / 2 is -4
    return a % b  # the remainder has the sign of b, so a is always (a / b) * b + a % b


# How mini writes a value: true and false in small letters.
def show(value):
    if type(value) is bool:
        return "true" if value else "false"
    return str(value)


SYMBOLS = [  # the symbols mini knows
    "==", "!=", "<=", ">=", "<", ">",
    "+", "-", "*", "/",
    "%",
    "(", ")",
    "=",
    ";",
]
WORDS = ["let", "true", "false", "print"]  # mini's own words: they can not name a variable


# The tokenizer cuts the source into pieces: a run of spaces, a number, a name and more, or any other one
# character. It turns each piece into a token, the words of mini, and leaves the spaces out.
PIECES = r"[ \t\r]+|[0-9]+|[A-Za-z_][A-Za-z_0-9]*|[=!<>]=|[\s\S]"


def tokenize(source):
    tokens = []

    def add(kind, text):
        tokens.append(Token(kind=kind, text=text))

    for piece in re.findall(PIECES, source):
        if re.match("[0-9]", piece):
            add("number", piece)
        elif re.match("[A-Za-z_]", piece):
            add(piece if piece in WORDS else "name", piece)
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
    def accept(kind):
        if tokens[0].kind != kind:
            return False
        tokens.pop(0)
        return True
    def expect(kind):
        if tokens[0].kind != kind:
            raise MiniError(f"expected {kind} but found {tokens[0].text}")
        return tokens.pop(0)
    # Statements, with ; between them, up to the end, or up to the } of a block.
    def statements(end):
        found = []
        while True:
            while accept(";"):
                pass
            if accept(end):
                return found
            node = statement()
            found.append(node)
            if tokens[0].kind not in [";", end]:
                raise MiniError(f"expected ; but found {tokens[0].text}")
    def statement():
        if accept("let"):
            name = expect("name").text
            expect("=")
            return Node(kind="let", name=name, value=expression())
        if tokens[0].kind == "name" and tokens[1].kind == "=":
            name = tokens.pop(0).text
            tokens.pop(0)
            return Node(kind="set", name=name, value=expression())
        if accept("print"):
            return Node(kind="print", value=expression())
        return Node(kind="expr", value=expression())
    def binary(ops, operand):
        left = operand()
        while tokens[0].kind in ops:
            left = Node(kind="binary", op=tokens.pop(0).kind, left=left, right=operand())
        return left
    def expression():
        return binary(["==", "!=", "<", "<=", ">", ">="], term)
    def term():
        return binary(["+", "-"], factor)
    def factor():
        return binary(["*", "/", "%"], unary)
    def unary():
        return Node(kind="negate", value=unary()) if accept("-") else primary()
    def primary():
        token = tokens.pop(0)
        if token.kind == "number":
            return Node(kind="value", value=number(token.text))
        if token.kind in ["true", "false"]:
            return Node(kind="value", value=token.kind == "true")
        if token.kind == "name":
            return Node(kind="name", name=token.text)
        if token.kind == "(":
            node = expression()
            expect(")")
            return node
        raise MiniError(f"expected a value but found {token.text}")
    return statements("end")


# The variables, by name. top is the program's own scope: its variables, at the top level, outside any function.
top = {}


# The scope that holds a name. A scope is the variables a statement can see.
def find(scope, name):
    if name in scope:
        return scope
    raise MiniError(f"{name} is not defined")


# Work out the value of a node of the tree.
def evaluate(node, scope):
    if node.kind == "value":
        return node.value
    if node.kind == "name":
        return find(scope, node.name)[node.name]
    if node.kind == "negate":
        return operate("-", 0, evaluate(node.value, scope))
    return operate(node.op, evaluate(node.left, scope), evaluate(node.right, scope))


# Carry out one statement in a scope. The value of a statement that is only an expression is given back.
def execute(node, scope):
    if node.kind == "let":
        scope[node.name] = evaluate(node.value, scope)
    elif node.kind == "set":
        value = evaluate(node.value, scope)
        find(scope, node.name)[node.name] = value
    elif node.kind == "print":
        print(show(evaluate(node.value, scope)))
    else:
        return evaluate(node.value, scope)


# Say what went wrong. A mistake in the program is not a crash of mini: anything else is.
def report(error):
    if not isinstance(error, MiniError):
        raise error
    print(f"error: {error}")


# Run a line that was typed, and say what went wrong if anything did: a mistake does not stop mini.
def attempt(line):
    try:
        for node in parse(tokenize(line)):
            value = execute(node, top)
            if node.kind == "expr":
                print(show(value))
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
