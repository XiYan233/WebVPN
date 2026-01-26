const { createServer } = require("http");
const next = require("next");
const { attachWebSocketServer } = require("./src/server/ws");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = process.env.PORT || 3000;

app.prepare().then(() => {
  const server = createServer((req, res) => {
    if (req.url === "/" || req.url?.startsWith("/?")) {
      res.writeHead(302, { Location: "/webvpn" });
      res.end();
      return;
    }
    handle(req, res);
  });

  attachWebSocketServer(server);

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
  });
});
