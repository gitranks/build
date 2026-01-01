# web: a web server, written from nothing on a plain socket, with no library.
# While it runs, open http://localhost:8080 in your browser. Start it with: python3 server.py (python on Windows)
import socket
import sys

# Print UTF-8 with plain line ends on every system, each line as soon as it is printed.
sys.stdout.reconfigure(encoding="utf-8", newline="\n", line_buffering=True)

# The port: 8080, or the number after --port. With --port 0 the system picks a free one.
at = sys.argv.index("--port") if "--port" in sys.argv else 0
PORT = int(sys.argv[at + 1]) if 0 < at < len(sys.argv) - 1 else 8080


# Read a request's head: its first line, then one header a line.
def parse(head):
    first, *lines = head.split("\r\n")
    method, target, version = first.split(" ")
    return {"method": method, "target": target, "version": version}


# Write an answer: the status line, one header a line, a blank line, then the body.
def send(conn, body):
    data = body.encode()
    head = [
        "HTTP/1.1 200 OK",
        "Content-Type: text/plain; charset=utf-8",
        f"Content-Length: {len(data)}",
        "Connection: close",
    ]
    conn.sendall(("\r\n".join(head) + "\r\n\r\n").encode() + data)


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
    print(f"web: {request['method']} {request['target']}")
    send(conn, f"You asked for {request['target']} with {request['method']}.")


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
