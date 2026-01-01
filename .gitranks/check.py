# The quiet check of a step: it starts the server a few times, each time on a free port the system picks, sends it
# requests made from the seed on a plain socket, as a browser would, and prints what came back. It decides nothing:
# GitRanks compares the print with what it expects. The port differs on every run, so it is printed as <port>.
import hashlib
import json
import os
import re
import shutil
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


def cut(line):
    return line[:100] + "..." if len(line) > 100 else line


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


# What came back, split into answers: each is a head up to a blank line, then as many bytes of body as its
# Content-Length says. A head with no blank line yet is kept as it is.
def answers_in(data):
    answers = []
    while data:
        end = data.find(b"\r\n\r\n")
        if end < 0:
            answers.append({"head": None, "body": data})
            break
        head = data[:end].decode("latin-1")
        found = re.search(r"\r\ncontent-length: *([0-9]+)", head, re.IGNORECASE)
        size = int(found.group(1)) if found else None
        stop = len(data) if size is None else min(len(data), end + 4 + size)
        answers.append({"head": head, "size": size, "body": data[end + 4 : stop]})
        data = data[stop:]
    return answers


def whole(answers):
    return len([a for a in answers if a["head"] is not None and a["size"] is not None and len(a["body"]) >= a["size"]])


# Print one answer: its status line and headers on one line, then the lines of its body that `show` keeps.
def tell(about, answer, show):
    if not answer:
        said.append((about, "got: nothing, the connection closed"))
        return
    if answer["head"] is None:
        said.append((about, "got: no blank line after the head: " + cut(json.dumps(answer["body"].decode("latin-1"), ensure_ascii=False))))
        return
    said.append((about, "got: " + " | ".join(answer["head"].split("\r\n"))))
    if answer["size"] is not None and len(answer["body"]) < answer["size"]:
        said.append((about, f"body: {len(answer['body'])} bytes came, but Content-Length says {answer['size']}"))
    for i, line in enumerate(answer["body"].decode("utf-8", "replace").split("\n")):
        if line.strip() and show(line, i):
            said.append((about, f"body: {cut(line.rstrip())}"))


# Send a request on a connection of its own, in one piece or a few, and print what came back. The request asks the
# server to close the connection after its answer, so the check reads until it closes.
def ask(port, about, pieces, label=None, show=lambda line, i: i < 3, brief=False):
    request = "".join(pieces)
    sent = label or request.split("\r\n")[0]
    link = Link(port)
    if not link.open:
        said.extend([(about, f"sent: {sent}"), (about, "got: nothing, the server is not listening")])
        return
    for i, piece in enumerate(pieces):
        if i:
            time.sleep(0.15)
        link.send(piece)
    link.wait(lambda: False)
    link.close()
    answers = answers_in(link.got)
    answer = answers[0] if answers else None
    if brief:
        status = answer["head"].split("\r\n")[0] if answer and answer["head"] is not None else "nothing"
        body = answer["body"].decode("utf-8", "replace").split("\n")[0] if answer and answer["head"] is not None else ""
        said.append((about, f"sent: {sent} -> got: {status}" + (f" | body: {cut(body)}" if body else "")))
    else:
        said.append((about, f"sent: {sent}"))
        tell(about, answer, show)
    if len(answers) > 1:
        said.append((about, f"then {len(link.got) - (len(answer['head']) + 4 + len(answer['body']))} bytes more than Content-Length says"))
    if not link.closed:
        said.append((about, "the server did not close the connection within 3 seconds"))


# A request with no body, as a browser sends one when you open a page.
def get(target, method="GET"):
    return f"{method} {target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"


# A form's request: a body of name=value, with its length in Content-Length.
def post(target, body):
    return (
        f"POST {target} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/x-www-form-urlencoded\r\n"
        f"Content-Length: {len(body.encode())}\r\nConnection: close\r\n\r\n{body}"
    )


session("what-you-will-build", None)
session("listen-on-a-port", lambda port: ask(port, "listen-on-a-port", [get("/")]))


def read_the_request(port):
    line, *rest = get(pick(["/", "/hello", "/cats"])).split("\r\n")
    ask(port, "read-the-request", [line + "\r\n", "\r\n".join(rest)], label=f"{line}, in two pieces")


session("read-the-request", read_the_request)
session("answer-by-hand", lambda port: ask(port, "answer-by-hand", [get(pick(["/", "/index.html", "/dogs"]))]))


def read_the_request_line(port):
    ask(port, "read-the-request-line", [get(pick(["/hello?name=Ada", "/cats/1", "/a/b/c"]))])
    target = pick(["/notes", "/x?y=z", "/"])
    ask(port, "read-the-request-line", [get(target, pick(["DELETE", "PUT", "POST"]))])


session("read-the-request-line", read_the_request_line)


def read_the_headers(port):
    extra = "User-Agent: " + pick(["web-check/1", "curious-browser", "a teapot"]) + "\r\nX-Color:   " + pick(["blue", "green", "red"]) + "  \r\nACCEPT: text/plain\r\nX-Time: 12:30\r\n"
    ask(port, "read-the-headers", [get("/" + pick(["page", "headers", "hello"])).replace("\r\n\r\n", f"\r\n{extra}\r\n", 1)], show=lambda line, i: i < 7)


session("read-the-headers", read_the_headers)


def not_found(port):
    ask(port, "not-found", [get("/")], show=lambda line, i: i < 1)
    ask(port, "not-found", [get(pick(["/cats", "/nothing/here", "/hello"]))])


session("not-found", not_found)
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
