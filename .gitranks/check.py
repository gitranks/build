# The quiet check of a step: it starts your server, sends it messages made from the seed and
# prints what came back. It decides nothing: GitRanks compares the print with what it expects.
import hashlib
import json
import subprocess
import sys
import tempfile

n = 1
for ch in sys.argv[2] if len(sys.argv) > 2 else "1":
    n = (n * 31 + ord(ch)) % 2147483647
seed = str(n)
lines = []
said = []  # each line the programs printed, with what it answers: an id, "logged", "prompt" or "always"


def show(name, file, args, sent):
    data = "".join(line + "\n" for line in sent).encode()
    # Files, not pipes: a program left running can not keep the check waiting.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            code = subprocess.run([sys.executable, file, *args], input=data, stdout=out, stderr=err, timeout=5).returncode
        except subprocess.TimeoutExpired:
            code = None
        out.seek(0)
        err.seek(0)
        stdout, stderr = out.read().decode("utf-8", "replace"), err.read().decode("utf-8", "replace")
    for line in stdout.splitlines():
        if line.strip():
            said.append((answer_id(line) if name == "server" else name, f"{name} said: {line.strip()}"))
    for line in stderr.splitlines():
        if line.startswith("my-server: "):
            said.append(("logged" if name == "server" else name, f"{name} logged: {line[11:].strip()}"))
    if code is None:
        said.append(("always", f"{name} did not stop within 5 seconds"))
    elif code != 0:
        said.append(("always", f"{name} stopped with code {code}"))


# The id of the request a line answers, null for an error with no request; "?" for a line that is not an answer.
def answer_id(line):
    try:
        answer = json.loads(line)
    except ValueError:
        return "?"
    id = answer.get("id", "?") if isinstance(answer, dict) else "?"
    return id if id is None or isinstance(id, (str, int, float)) else "?"


show("server", "server.py", ["--seed", seed], lines)

# What this step adds is printed whole: the answers it is about (by id, None for id null), the logs or the prompt.
# Every other line goes into one line with a fingerprint (a hash), so the print stays short. With --all, every line
# is printed, after a first line that says this print is only to look at.
focus = {"logged"}
every = sys.argv[3:4] == ["--all"]
other = [text for key, text in said if not (every or key in focus or key == "always")]
if every:
    print("all lines, printed with --all: never send this print, send the one without --all")
for key, text in said:
    if every or key in focus or key == "always":
        print(text)
if other:
    digest = hashlib.sha256("\n".join(other).encode()).hexdigest()[:8]
    print(f"{len(other)} more lines (earlier steps' answers and the logs), fingerprint {digest}: to see them, add --all at the end of the check command")
