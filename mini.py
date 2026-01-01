# mini: a small programming language and its interpreter, written from nothing, with no library.
# You type a line of mini, such as 1 + 2 * 3, and it answers 7. Start it with: python mini.py
import re
import sys
from types import SimpleNamespace as Token  # a token: Token(kind="number", text="12")
Node = Token  # and a node of a tree is made the same way: Node(kind="binary", op="+", left=..., right=...)

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")
where = 1  # the line mini is at: the line it reads, or the line of the statement it runs


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
    if op == "==":  # in mini, 1 and true are not the same, and a function is the same only as itself
        return type(a) is type(b) and (a is b if type(a) is Node else a == b)
    if op == "!=":
        return not operate("==", a, b)
    if op == "+" and (type(a) is str or type(b) is str):
        return show(a) + show(b)
    if type(a) is not int or type(b) is not int:
        raise MiniError(f"{op} needs numbers, not {quote(a)} and {quote(b)}")
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
    if value is None:
        return "none"
    if isinstance(value, Node):  # a function's value is its own node of the tree
        return f"<fn {value.name}>"
    if type(value) is bool:
        return "true" if value else "false"
    return str(value)


# A value as an error shows it: text in quotes, so "5" and 5 look different.
def quote(value):
    return f'"{value}"' if type(value) is str else show(value)


SYMBOLS = [  # the symbols mini knows
    "==", "!=", "<=", ">=", "<", ">",
    "+", "-", "*", "/",
    "%",
    "(", ")",
    "=",
    ";",
    "{", "}",
    ",",
]
WORDS = ["let", "true", "false", "print", "if", "else", "while", "fn", "return"]  # mini's own words


# The tokenizer cuts the source into pieces: a run of spaces, a number, a name and more, or any other one
# character. It turns each piece into a token, the words of mini, and leaves the spaces out.
PIECES = r'[ \t\r]+|#[^\n]*|\n|[0-9]+|[A-Za-z_][A-Za-z_0-9]*|"[^"\n]*"?|[=!<>]=|[\s\S]'


def tokenize(source, line=1):
    global where
    tokens = []

    def add(kind, text):
        tokens.append(Token(kind=kind, text=text, line=line))

    for piece in re.findall(PIECES, source):
        where = line
        if piece == "\n":
            add(";", "the end of the line")  # a line end ends a statement, as ; does
            line += 1
        elif re.match("[0-9]", piece):
            add("number", piece)
        elif re.match("[A-Za-z_]", piece):
            add(piece if piece in WORDS else "name", piece)
        elif piece[0] == '"':
            if len(piece) < 2 or not piece.endswith('"'):
                raise MiniError('this text has no closing "')
            add("text", piece[1:-1])
        elif piece in SYMBOLS:
            add(piece, piece)
        elif piece[0] not in " \t\r#":  # # starts a comment
            raise MiniError(f"unexpected character {piece}")
    add("end", "the end")
    return tokens


# The parser reads the tokens into a tree. binary reads an operand, then each operator with the operand after it.
# Each level of operators has its own function, the loosest first: in 2 + 3 * 4, 3 * 4 is one operand of the +.
# tokens[0] is the token at hand, and tokens.pop(0) takes it off the list.
def parse(tokens):
    inside = 0  # how many functions the parser is inside: a return is only for inside one
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
            if tokens[0].kind == "end":
                raise MiniError("a { has no } to close it")
            node = lined()
            found.append(node)
            if tokens[0].kind not in [";", end, "end"] and node.kind not in ["if", "while", "fn"]:  # these end in }
                raise MiniError(f"expected ; but found {tokens[0].text}")
    # A statement, with the line it starts on, for an error to name.
    def lined():
        global where
        where = line = tokens[0].line
        node = statement()
        node.line = line
        return node
    def block():
        expect("{")
        return statements("}")
    def statement():
        nonlocal inside
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
        if accept("if"):
            test, then = expression(), block()
            otherwise = [] if not accept("else") else [lined()] if tokens[0].kind == "if" else block()
            return Node(kind="if", test=test, then=then, otherwise=otherwise)
        if accept("while"):
            return Node(kind="while", test=expression(), body=block())
        if accept("fn"):
            name = expect("name").text
            expect("(")
            params = []
            while not accept(")"):
                if params:
                    expect(",")
                params.append(expect("name").text)
            inside += 1
            body = block()
            inside -= 1
            return Node(kind="fn", name=name, params=params, body=body)
        if accept("return"):
            if not inside:
                raise MiniError("return is only for inside a function")
            return Node(kind="return", value=None if tokens[0].kind in [";", "}", "end"] else expression())
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
        return Node(kind="negate", value=unary()) if accept("-") else call()
    # A value, then any number of calls of it: f() or f(1, 2).
    def call():
        node = primary()
        while accept("("):
            args = []
            while not accept(")"):
                if args:
                    expect(",")
                args.append(expression())
            node = Node(kind="call", callee=node, args=args)
        return node
    def primary():
        token = tokens.pop(0)
        if token.kind == "number":
            return Node(kind="value", value=number(token.text))
        if token.kind in ["true", "false"]:
            return Node(kind="value", value=token.kind == "true")
        if token.kind == "text":
            return Node(kind="value", value=token.text)
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
    if name in top:
        return top  # a call's own variable first, then the program's
    raise MiniError(f"{name} is not defined")


# mini's own limit on calls inside calls. A recursion that never stops ends here, the same in every language.
DEEPEST = 50
depth = 0
sys.setrecursionlimit(2000)  # room for 50 calls of mini, each several calls of Python with blocks inside


# A return statement raises this, and the call it is in catches it, with the value.
class Return(Exception):
    def __init__(self, value):
        self.value = value


# Work out the value of a node of the tree.
def evaluate(node, scope):
    global where
    global depth
    if node.kind == "value":
        return node.value
    if node.kind == "name":
        return find(scope, node.name)[node.name]
    if node.kind == "negate":
        return operate("-", 0, evaluate(node.value, scope))
    if node.kind == "call":
        fn = evaluate(node.callee, scope)
        args = [evaluate(arg, scope) for arg in node.args]
        if not isinstance(fn, Node):
            raise MiniError(f"{quote(fn)} is not a function")
        if len(args) != len(fn.params):
            raise MiniError(f"{fn.name} takes ({', '.join(fn.params)})")
        if depth == DEEPEST:
            raise MiniError(f"too deep: more than {DEEPEST} calls inside each other")
        back = where
        depth += 1
        value = None
        try:
            run(fn.body, dict(zip(fn.params, args)))
        except Return as signal:
            value = signal.value
        finally:
            depth -= 1
        where = back  # back to the line of the call, now that the call is done
        return value
    return operate(node.op, evaluate(node.left, scope), evaluate(node.right, scope))


# Carry out one statement in a scope. The value of a statement that is only an expression is given back.
def execute(node, scope):
    global where
    where = node.line
    if node.kind == "let":
        scope[node.name] = evaluate(node.value, scope)
    elif node.kind == "set":
        value = evaluate(node.value, scope)
        find(scope, node.name)[node.name] = value
    elif node.kind == "print":
        print(show(evaluate(node.value, scope)))
    elif node.kind == "if":
        run(node.then if truth(evaluate(node.test, scope), "if") else node.otherwise, scope)
    elif node.kind == "while":
        while truth(evaluate(node.test, scope), "while"):
            run(node.body, scope)
            where = node.line  # back to the while's line, for its test
    elif node.kind == "fn":
        scope[node.name] = node
    elif node.kind == "return":
        raise Return(evaluate(node.value, scope) if node.value else None)
    else:
        return evaluate(node.value, scope)


def run(found, scope):  # the statements of a block, one after another
    for node in found:
        execute(node, scope)


def truth(value, word):  # the answer to an if or a while must be true or false
    if type(value) is not bool:
        raise MiniError(f"{word} needs true or false, not {quote(value)}")
    return value


# Say what went wrong. A mistake in the program is not a crash of mini: anything else is.
def report(error):
    # A program can nest too deep for the language mini is written in too, with no call: 1 + (1 + (1 + ...)).
    deep = isinstance(error, RecursionError)
    if not isinstance(error, MiniError) and not deep:
        raise error
    print(f"error: line {where}: {'too deep' if deep else error}")


# Run some source: a line typed at the prompt, or a whole file. At the prompt, an expression's value is said.
def run_source(source, line, prompt):
    for node in parse(tokenize(source, line)):
        value = execute(node, top)
        if prompt and node.kind == "expr" and value is not None:
            print(show(value))


# Run a line that was typed, and say what went wrong if anything did: a mistake does not stop mini.
def attempt(text, line):
    try:
        run_source(text, line, True)
    except Exception as error:
        report(error)


# The prompt: read a line, run it, say the answer, and again, until exit or the end of the input.
def repl():
    if sys.stdin.isatty():
        print("mini: type a line, then Enter. exit stops mini.")
    count = 0  # the lines read so far: an error names its line by this count
    while True:
        try:
            # The prompt mini> shows only when you type at a terminal, not when another program sends the lines.
            line = input("mini> " if sys.stdin.isatty() else "")
        except EOFError:  # the input has ended
            break
        count += 1
        if line.strip() == "exit":
            break
        if line.strip():
            attempt(line, count)


# python mini.py hello.mini runs the file: no prompt, nothing said but what print says, and an error stops it.
if len(sys.argv) < 2:
    repl()
else:
    try:
        with open(sys.argv[1], encoding="utf-8", newline="") as file:
            run_source(file.read(), 1, False)
    except Exception as error:
        report(error)
        sys.exit(1)
