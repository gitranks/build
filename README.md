# web

A web server written from nothing on a plain socket, with no library, one step at a time with GitRanks Build.

Start it in this folder with `node server.ts`, then open http://localhost:8080 in your browser. If another program
already uses port 8080, pick another port: `node server.ts --port 8081`. Ctrl+C stops it.

It reads each request by hand, byte by byte: the first line, the headers and the body. It answers from its routes,
or with a file from the `public` folder, and it serves many browsers at once.
