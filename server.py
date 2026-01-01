# web: a web server, written from nothing on a plain socket, with no library.
# While it runs, open http://localhost:8080 in your browser. Start it with: python3 server.py (python on Windows)
import html
import os
import socket
import sys
import urllib.parse

# Print UTF-8 with plain line ends on every system, each line as soon as it is printed.
sys.stdout.reconfigure(encoding="utf-8", newline="\n", line_buffering=True)

# The port: 8080, or the number after --port. With --port 0 the system picks a free one.
at = sys.argv.index("--port") if "--port" in sys.argv else 0
PORT = int(sys.argv[at + 1]) if 0 < at < len(sys.argv) - 1 else 8080
# The folder whose files anyone may ask for: public, beside this file.
PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
# The type of each kind of file, for the Content-Type header: the browser reads it to know what it got.
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
}

# The words that go with each status code on an answer's first line.
REASONS = {
    200: "OK",
    301: "Moved Permanently",
    303: "See Other",
    404: "Not Found",
    405: "Method Not Allowed",
}


# An answer of plain text: its status code, the type of its body, and the body.
def text(body, status=200):
    return {"status": status, "type": "text/plain; charset=utf-8", "body": body}


# An HTML page: the browser draws it, and follows its links.
def page(title, *lines):
    top = [
        "<!doctype html>",
        f"<title>{title}</title>",
        '<link rel="stylesheet" href="/style.css">',
        f"<h1>{title}</h1>",
    ]
    return {"status": 200, "type": "text/html; charset=utf-8", "body": "\n".join([*top, *lines, ""])}


# The notes people send from the form on /notes, kept in memory while the server runs.
notes = []


# The routes: each function below answers one method and path, as ROUTES says.
def home(request):
    return page(
        "Hello from web",
        "<p>Every byte of this page came from your own server → no library, just a socket.</p>",
        "<ul>",
        '  <li><a href="/hello?name=Ada">/hello?name=Ada</a> says hello</li>',
        '  <li><a href="/headers">/headers</a> lists what your browser sent</li>',
        '  <li><a href="/old">/old</a> has moved to /hello</li>',
        '  <li><a href="/notes">/notes</a> keeps the notes you send</li>',
        '  <li><a href="/about.html">/about.html</a> is a file from the public folder</li>',
        "</ul>",
    )


def hello(request):
    name = urllib.parse.parse_qs(request["target"].partition("?")[2]).get("name", [""])[0]
    return text(f"Hello, {name or 'stranger'}!")


def old(request):
    return {**text("This page has moved to /hello.", 301), "headers": {"Location": "/hello"}}


def notes_page(request):
    # html.escape makes a note safe to put in a page: <b>hi</b> is shown as it was typed, never read as HTML.
    shown = [f"<p>{html.escape(note)}</p>" for note in notes]
    form = '<form method="post" action="/notes"><input name="note" autofocus> <button>Add a note</button></form>'
    return page("Notes", *shown, form)


def add_note(request):
    # A form sends its fields as a body such as note=Buy+milk%21: a space as +, other signs as % and two digits.
    form = urllib.parse.parse_qs(request["body"].decode("utf-8", "replace"))
    note = form.get("note", [""])[0].strip()
    if note:
        notes.append(note)
    # 303 sends the browser on to /notes, so a reload asks for that page, and never sends the form twice.
    return {**text("Saved. See /notes.", 303), "headers": {"Location": "/notes"}}


ROUTES = {
    "GET /": home,
    "GET /hello": hello,
    "GET /headers": lambda request: text("\n".join(f"{name}: {value}" for name, value in request["headers"].items())),
    "GET /old": old,
    "GET /notes": notes_page,
    "POST /notes": add_note,
}


# A file from the public folder, such as /style.css. Its type comes from the end of its name.
def file(pathname):
    name = os.path.normpath(os.path.join(PUBLIC, urllib.parse.unquote(pathname).lstrip("/")))
    # A path such as /../server.py leads out of the folder: every file outside it stays private.
    if not name.startswith(PUBLIC + os.sep) or not os.path.isfile(name):
        return text(f"no page at {pathname}", 404)
    with open(name, "rb") as found:
        return {"status": 200, "type": TYPES.get(os.path.splitext(name)[1], "application/octet-stream"), "body": found.read()}


# Find the route for a request. A path with no route gets 404 Not Found.
def handle(request):
    pathname = request["target"].partition("?")[0]
    route = ROUTES.get(f"{request['method']} {pathname}")
    if route:
        return route(request)
    # The path has routes, but for other methods: 405, and the Allow header names them.
    methods = [key.split(" ")[0] for key in ROUTES if key.split(" ")[1] == pathname]
    if methods:
        return {**text(f"{request['method']} is not allowed at {pathname}", 405), "headers": {"Allow": ", ".join(methods)}}
    if request["method"] == "GET":
        return file(pathname)
    return text(f"no page at {pathname}", 404)


# Read a request's head: its first line, then one header a line.
def parse(head):
    first, *lines = head.split("\r\n")
    method, target, version = first.split(" ")
    # A header line is a name, a colon and a value. A name has no case: Host and host are the same.
    headers = {}
    for line in lines:
        name, colon, value = line.partition(":")
        headers[name.strip().lower()] = value.strip()
    return {"method": method, "target": target, "version": version, "headers": headers, "body": b""}


# Write an answer: the status line, one header a line, a blank line, then the body.
def send(conn, answer):
    data = answer["body"].encode() if isinstance(answer["body"], str) else answer["body"]
    head = [
        f"HTTP/1.1 {answer['status']} {REASONS[answer['status']]}",
        f"Content-Type: {answer['type']}",
        f"Content-Length: {len(data)}",
        "Connection: close",
    ]
    head += [f"{name}: {value}" for name, value in answer.get("headers", {}).items()]
    conn.sendall(("\r\n".join(head) + "\r\n\r\n").encode() + data)


# Answer one request, and say so in the log.
def respond(conn, request):
    answer = handle(request)
    print(f"web: {request['method']} {request['target']} {answer['status']}")
    send(conn, answer)


# Add the next piece of the request's bytes. An empty piece: the browser closed the connection.
def more(conn, data):
    piece = conn.recv(65536)
    if not piece:
        raise ConnectionError("the browser closed the connection")
    return data + piece


# One connection. Its bytes come in pieces of any size: they wait in `data` until the head ends, at a blank line.
def serve(conn):
    data = b""
    while b"\r\n\r\n" not in data:
        data = more(conn, data)
    end = data.index(b"\r\n\r\n")
    request = parse(data[:end].decode("latin-1"))
    # The Content-Length header says how many bytes of body come after the head.
    size = int(request["headers"].get("content-length", "0"))
    while len(data) < end + 4 + size:
        data = more(conn, data)
    request["body"] = data[end + 4 : end + 4 + size]
    respond(conn, request)


# One connection, closed at the end. A browser may hang up at any time: that ends its connection, never the server.
def connected(conn):
    conn.settimeout(1)  # a browser may open a connection and send nothing: after a second, it is closed
    with conn:
        try:
            serve(conn)
        except OSError:
            pass


# A server on a plain socket. 127.0.0.1 is this computer: only programs on it can connect, nobody else on your network.
try:
    listener = socket.create_server(("127.0.0.1", PORT))
except OSError as error:
    print(f"web: can not listen on port {PORT}: {error.strerror}")
    sys.exit(1)
listener.settimeout(0.5)  # wake twice a second, so Ctrl+C can stop the server on Windows too
print(f"web: listening on http://localhost:{listener.getsockname()[1]}")
try:
    while True:
        try:
            conn, _ = listener.accept()
        except TimeoutError:
            continue
        connected(conn)
except KeyboardInterrupt:
    print("web: stopped")
