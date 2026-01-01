// web: a web server, written from nothing on a plain socket, with no library.
// While it runs, open http://localhost:8080 in your browser. Start it with: node server.ts
import * as net from "node:net";

// The port: 8080, or the number after --port. With --port 0 the system picks a free one.
const at = process.argv.indexOf("--port");
const PORT = at > 0 ? Number(process.argv[at + 1]) : 8080;

// A server on a plain socket. The function below runs once for each connection a browser opens.
const server = net.createServer((socket) => {
  // A browser may hang up at any time. That ends its connection, never the server.
  socket.on("error", () => {});
  console.log("web: a browser connected");
  socket.end();
});
server.on("error", (error) => {
  console.log(`web: can not listen on port ${PORT}: ${error.message}`);
  process.exit(1);
});
// 127.0.0.1 is this computer: only programs on it can connect, nobody else on your network.
server.listen(PORT, "127.0.0.1", () => {
  const { port } = server.address() as net.AddressInfo;
  console.log(`web: listening on http://localhost:${port}`);
});
