# mini: a small programming language and its interpreter, written from nothing, with no library.
# You type a line of mini, such as 1 + 2 * 3, and it answers 7. Start it with: python mini.py
import re
import sys

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


# Say what went wrong. A mistake in the program is not a crash of mini: anything else is.
def report(error):
    if not isinstance(error, MiniError):
        raise error
    print(f"error: {error}")


# Run a line that was typed, and say what went wrong if anything did: a mistake does not stop mini.
def attempt(line):
    try:
        print(number(line.strip()))
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
