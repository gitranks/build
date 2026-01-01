# The quiet check of a step: it starts your server, sends it messages made from the seed and
# prints what came back. It decides nothing: GitRanks compares the print with what it expects.
import subprocess
import sys
import tempfile

n = 1
for ch in sys.argv[2] if len(sys.argv) > 2 else "1":
    n = (n * 31 + ord(ch)) % 2147483647
seed = str(n)
lines = []


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
            print(f"{name} said: {line.strip()}")
    for line in stderr.splitlines():
        if line.startswith("my-server: "):
            print(f"{name} logged: {line[11:].strip()}")
    if code is None:
        print(f"{name} did not stop within 5 seconds")
    elif code != 0:
        print(f"{name} stopped with code {code}")


show("server", "server.py", ["--seed", seed], lines)
