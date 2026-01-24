const http = require("http");
const { WebSocket } = require("ws");

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "");
      config[key] = args[i + 1];
      i += 1;
    }
  }
  return config;
}

const config = parseArgs();
const server = config.server || "http://localhost:3000";
const key = config.key;
const port = Number(config.port || 80);
const version = config.version;

if (!key) {
  console.error("Missing --key");
  process.exit(1);
}

function connect() {
  const wsUrl = new URL(server);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.pathname = "/ws";
  wsUrl.searchParams.set("key", key);
  if (version) {
    wsUrl.searchParams.set("version", version);
  }

  const ws = new WebSocket(wsUrl.toString());

  ws.on("open", () => {
    console.log("Connected to WebVPN server.");
  });

  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "heartbeat" }));
    }
  }, 10000);

  ws.on("message", async (data) => {
    try {
      const payload = JSON.parse(data.toString());
      if (!payload.id || !payload.method) {
        return;
      }

      const bodyBuffer = payload.body
        ? Buffer.from(payload.body, "base64")
        : Buffer.from("");

      const options = {
        method: payload.method,
        headers: {
          ...payload.headers,
          host: "127.0.0.1",
        },
      };

      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: payload.path,
          method: options.method,
          headers: options.headers,
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const responseBody = Buffer.concat(chunks).toString("base64");
            ws.send(
              JSON.stringify({
                id: payload.id,
                status: res.statusCode,
                headers: res.headers,
                body: responseBody,
              })
            );
          });
        }
      );

      req.on("error", (error) => {
        ws.send(
          JSON.stringify({
            id: payload.id,
            error: error.message,
          })
        );
      });

      if (bodyBuffer.length) {
        req.write(bodyBuffer);
      }
      req.end();
    } catch (error) {
      ws.send(JSON.stringify({ error: "Invalid request" }));
    }
  });

  ws.on("close", () => {
    clearInterval(heartbeat);
    console.log("Disconnected. Reconnecting in 3s...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
}

connect();
