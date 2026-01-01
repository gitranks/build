# web

A web server written from nothing on a plain socket, with no library, one step at a time with GitRanks Build.

Start it in this folder with `python3 server.py` on macOS and Linux, or `python server.py` on Windows (`py server.py`
if `python` is not found), then open http://localhost:8080 in your browser. If another program already uses port
8080, pick another port: `python3 server.py --port 8081` (`python server.py --port 8081` on Windows). Ctrl+C stops it.

It reads each request by hand, byte by byte: the first line, the headers and the body. It answers from its routes,
or with a file from the `public` folder, and it serves many browsers at once.
