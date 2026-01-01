# The quiet check of a step: it starts the server a few times, each time on a free port the system picks, sends it
# requests made from the seed on a plain socket, as a browser would, and prints what came back. It decides nothing:
# GitRanks compares the print with what it expects. The port differs on every run, so it is printed as <port>.
import hashlib
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time

sys.stdout.reconfigure(encoding="utf-8", newline="\n")
step = sys.argv[1] if len(sys.argv) > 1 else ""
n = 1
for ch in sys.argv[2] if len(sys.argv) > 2 else "1":
    n = (n * 31 + ord(ch)) % 2147483647


def pick(options):
    global n
    n = (n * 48271) % 2147483647 or 1
    return options[n % len(options)]


said = []  # each line to print, with the step it is about, or "always"
folder = tempfile.mkdtemp(prefix="web-check-")


# All the sessions together get 20 seconds at most, and a server that never says it listens ends the check there:
# the next sessions would wait for it too.
deadline = time.monotonic() + 20
stopped = False
runs = 0


def left():
    return deadline - time.monotonic()


def read(path):
    with open(path, "rb") as file:
        return file.read().decode("utf-8", "replace")


# Start the server, wait for its first line, which names its port, let `talk` send it requests, then stop it and
# keep what it printed.
def session(about, talk):
    global stopped, runs
    if stopped:
        return
    if left() < 1.5:
        stopped = True
        said.append(("always", "the check ran out of time: the server took too long to answer"))
        return
    runs += 1
    out = os.path.join(folder, f"out-{runs}.txt")
    err = os.path.join(folder, f"err-{runs}.txt")
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"}
    # Files, not pipes: a program the server started and left running can not keep the check waiting.
    with open(out, "wb") as out_file, open(err, "wb") as err_file:
        server = subprocess.Popen([sys.executable, "server.py", "--port", "0"], stdin=subprocess.DEVNULL, stdout=out_file, stderr=err_file, env=env)
    until = time.monotonic() + min(5, left())
    while "\n" not in read(out) and server.poll() is None and time.monotonic() < until:
        time.sleep(0.02)
    first = read(out).split("\n")[0].rstrip()
    found = re.search(r":([0-9]+)", first)
    port = found.group(1) if found else None

    def hide(line):
        return line.replace(f":{port}", ":<port>") if port else line

    if first:
        said.append(("listen-on-a-port" if talk else about, hide(first)))
    if "\n" not in read(out) and server.poll() is None:
        stopped = True
        said.append(("always", "the server printed no line in 5 seconds, so the check stopped there"))
    elif talk and server.poll() is None:
        if not port:
            said.append(("always", "the server's first line names no port, such as http://localhost:8080"))
        elif port == "0":
            said.append(("always", "the server's first line names port 0: print the port it listens on"))
        else:
            talk(int(port))
    code = server.poll()
    if code is None:
        server.kill()
    try:
        server.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass
    for line in read(out).split("\n")[1:]:
        if line.strip():
            said.append((about, hide(line.rstrip())))
    # A crash's line, with each path in it cut to its file's name.
    crash = [line for line in read(err).splitlines() if line[:1].isalpha() and "Error" in line.split(":")[0]]
    if crash:
        said.append(("always", "the server crashed: " + re.sub(r"""(?:[A-Za-z]:)?[\\/][^\s'"]*[\\/]([^\\/\s'"]+)""", r"\1", re.sub(r"""(['"])[^'"]*[\\/]([^\\/'"]*)\1""", r"\1\2\1", crash[-1].strip()))))
    if code is not None and code != 0:
        said.append(("always", f"the server stopped with code {code}"))


# A connection to the server, and every byte it sent back.
class Link:
    def __init__(self, port):
        self.got = b""
        self.closed = False
        try:
            self.sock = socket.create_connection(("127.0.0.1", port), timeout=2)
            self.open = True
        except OSError:
            self.sock = None
            self.open = False
            self.closed = True

    def send(self, data):
        try:
            self.sock.sendall(data.encode())
        except OSError:
            pass

    # Read what has come, waiting `seconds` at most for it.
    def poll(self, seconds):
        if self.closed or seconds <= 0:
            return
        self.sock.settimeout(seconds)
        try:
            piece = self.sock.recv(65536)
        except socket.timeout:
            return
        except OSError:
            piece = b""
        if piece:
            self.got += piece
        else:
            self.closed = True

    # Wait until test() is true or the server closes the connection: 3 seconds at most.
    def wait(self, test):
        until = time.monotonic() + min(3, left())
        while not test() and not self.closed and time.monotonic() < until:
            self.poll(until - time.monotonic())

    def close(self):
        if self.sock:
            self.sock.close()


# Send one request on a connection of its own, with its body when it has one, and print it and its answer on one
# line: the status, each header but the length and the connection, and the body.
def call(port, about, method, target, body=""):
    sent = f"{method} {target}" + (f" {body}" if body else "")
    link = Link(port)
    if not link.open:
        said.append((about, f"{sent} -> nothing, the server is not listening"))
        return
    link.send(f"{method} {target} HTTP/1.1\r\nHost: localhost\r\nContent-Length: {len(body.encode())}\r\nConnection: close\r\n\r\n{body}")
    link.wait(lambda: False)
    link.close()
    end = link.got.find(b"\r\n\r\n")
    if end < 0:
        said.append((about, f"{sent} -> " + ("an answer with no blank line after its head" if link.got else "nothing, the connection closed")))
        return
    first, *headers = link.got[:end].decode("latin-1").split("\r\n")
    shown = [line for line in headers if not re.match(r"(content-length|connection):", line, re.IGNORECASE)]
    answer = re.sub(r"\s*\n\s*", " ", link.got[end + 4 :].decode("utf-8", "replace")).strip()
    words = [f"{sent} -> {first.removeprefix('HTTP/1.1 ')}", *shown, answer[:200] + "..." if len(answer) > 200 else answer]
    said.append((about, " | ".join(word for word in words if word)))
    if not link.closed:
        said.append((about, "the server did not close the connection within 3 seconds"))


def compact(value):
    return json.dumps(value, separators=(",", ":"))


titles = ["Buy milk", "Call Grace", "Water the plants"]


def answer_in_json(port):
    call(port, "answer-in-json", "GET", "/api/tasks")
    call(port, "answer-in-json", "POST", "/api/tasks", compact({"title": pick(titles)}))
    call(port, "answer-in-json", "POST", "/api/tasks", compact({"title": pick(["Read a book", "Fix the bike"]), "done": True}))
    call(port, "answer-in-json", "GET", "/api/tasks")


session("answer-in-json", answer_in_json)


def a_task_by_id(port):
    call(port, "a-task-by-id", "POST", "/api/tasks", compact({"title": pick(titles)}))
    call(port, "a-task-by-id", "GET", "/api/tasks/1")
    call(port, "a-task-by-id", "GET", "/api/tasks/" + pick(["2", "42", "abc"]))


session("a-task-by-id", a_task_by_id)


def check_the_fields(port):
    bodies = [
        pick(['{"title":""}', '{"title":42}', '{"done":true}', '{"title":"   "}']),
        pick(['{"title":"Buy milk","done":"yes"}', '{"title":"Buy milk","done":1}', '{"title":"Buy milk","done":null}']),
        pick(["title=Buy+milk", '{"title":"Buy milk"', ""]),
        pick(['["Buy milk"]', '"Buy milk"', "null"]),
        compact({"title": f"  {pick(titles)}  "}),
    ]
    for body in bodies:
        call(port, "check-the-fields", "POST", "/api/tasks", body)


session("check-the-fields", check_the_fields)


def change_and_delete(port):
    call(port, "change-and-delete", "POST", "/api/tasks", compact({"title": pick(titles)}))
    call(port, "change-and-delete", "PATCH", "/api/tasks/1", pick(['{"done":true}', '{"title":"Buy oat milk"}', '{"title":"Call Ada","done":true}']))
    call(port, "change-and-delete", "PATCH", "/api/tasks/1", pick(['{"title":""}', '{"done":"no"}', '{"title":7}']))
    call(port, "change-and-delete", "DELETE", "/api/tasks/1")
    call(port, "change-and-delete", pick(["GET", "DELETE"]), "/api/tasks/1")


session("change-and-delete", change_and_delete)

# Your tests, run by Python's own runner, unittest, as you run them, each one's result printed with its name.
RUNNER = """
import unittest
def name(test):
    method = test.id().split(".")[-1]
    return method + ".py" if type(test).__name__ == "_FailedTest" else method.removeprefix("test_").replace("_", " ")
class Result(unittest.TestResult):
    def addSuccess(self, test):
        print("ok", name(test))
    def addFailure(self, test, err):
        print("FAIL", name(test))
    addError = addFailure
    def addSkip(self, test, reason):
        print("skipped", name(test))
    def addSubTest(self, test, subtest, err):
        if err is not None:
            print("FAIL", name(test))
    def addExpectedFailure(self, test, err):
        print("ok", name(test))
    def addUnexpectedSuccess(self, test):
        print("FAIL", name(test))
unittest.defaultTestLoader.discover(".").run(Result())
"""


# Run your tests, and print what each one gave, by its name. At the end the runner is stopped with everything it
# started, each server too, even when a test never ends.
def tests(about):
    global stopped, runs
    if stopped:
        return
    if left() < 3:
        stopped = True
        said.append(("always", "the check ran out of time before the tests could run"))
        return
    if not os.path.exists("test_server.py"):
        said.append((about, "the tests: none yet"))
        return
    runs += 1
    out = os.path.join(folder, f"out-{runs}.txt")
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"}
    own = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    with open(out, "wb") as out_file, open(os.path.join(folder, f"err-{runs}.txt"), "wb") as err_file:
        runner = subprocess.Popen([sys.executable, "-c", RUNNER], stdin=subprocess.DEVNULL, stdout=out_file, stderr=err_file, env=env, **own)
    try:
        code = runner.wait(timeout=min(10, left()))
    except subprocess.TimeoutExpired:
        code = None
    # On Windows only a runner still running has a tree to stop.
    try:
        if os.name == "nt" and code is None:
            subprocess.run(["taskkill", "/pid", str(runner.pid), "/t", "/f"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif os.name != "nt":
            os.killpg(runner.pid, signal.SIGKILL)
    except OSError:
        pass
    if code is None:
        stopped = True
        said.append(("always", "the tests did not end in time, so the check stopped there"))
        return
    found = {}  # a test with failing subtests says FAIL once for each: one FAIL is kept
    for line in read(out).splitlines():
        result, _, name = line.partition(" ")
        if result in ("ok", "FAIL", "skipped") and found.get(name) != "FAIL":
            found[name] = result
    results = list(found.items())
    counts = {what: len([1 for _, result in results if result == what]) for what in ("ok", "FAIL")}
    failed = f", {counts['FAIL']} failed" if counts["FAIL"] else ""
    said.append((about, f"the tests: {len(results)} ran, {counts['ok']} passed{failed}" if results else "the tests: none ran"))
    for name, result in sorted(results):
        said.append((about, f"{result}: {name}"))


tests("test-change-and-delete")
shutil.rmtree(folder, ignore_errors=True)

# What this step adds is printed whole. Every other line goes into one line with a fingerprint (a hash), so the
# print stays short. With --all, every line is printed, after a first line that says this print is only to look at.
every = sys.argv[3:4] == ["--all"]
shown = [text for about, text in said if every or about in ("always", step)]
other = [text for about, text in said if not (every or about in ("always", step))]
if every:
    print("all lines, printed with --all: never send this print, send the one without --all")
for text in shown:
    print(text)
if other:
    digest = hashlib.sha256("\n".join(other).encode()).hexdigest()[:8]
    print(f"{len(other)} more lines (earlier steps' answers and the logs), fingerprint {digest}: to see them, add --all at the end of the check command")
sys.stdout.flush()
os._exit(0)
