# web: a web server, written from nothing on a plain socket, with no library.
# While it runs, open http://localhost:8080 in your browser. Start it with: python3 server.py (python on Windows)
import socket
import sys

# Print UTF-8 with plain line ends on every system, each line as soon as it is printed.
sys.stdout.reconfigure(encoding="utf-8", newline="\n", line_buffering=True)

# The port: 8080, or the number after --port. With --port 0 the system picks a free one.
at = sys.argv.index("--port") if "--port" in sys.argv else 0
PORT = int(sys.argv[at + 1]) if 0 < at < len(sys.argv) - 1 else 8080


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
        print("web: a browser connected")
        conn.close()
except KeyboardInterrupt:
    print("web: stopped")
