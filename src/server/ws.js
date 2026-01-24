const { WebSocketServer } = require("ws");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const Redis = require("ioredis");
const {
  registerConnection,
  unregisterConnection,
  resolveProxyResponse,
} = require("../lib/tunnelRegistry");

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const STATUS_TTL_SECONDS = 86400;
const ONLINE_TTL_SECONDS = 30;

function parseCookies(header = "") {
  return header.split(";").reduce((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

async function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers?.cookie ?? "");
  const token =
    cookies["authjs.session-token"] || cookies["__Secure-authjs.session-token"];
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expires && session.expires < new Date()) return null;
  if (!session.user?.isActive) return null;
  return session;
}

async function hasPermission(userId, permissionKey) {
  const roles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return roles.some((role) =>
    role.role.permissions.some((perm) => perm.permission.key === permissionKey)
  );
}

async function getStatusSnapshot({ userId, isAdmin }) {
  const clients = await prisma.client.findMany({
    where: isAdmin ? {} : { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  const ids = clients.map((client) => client.id);
  if (!ids.length) return [];

  const [onlineValues, lastSeenValues, ipValues, versionValues, lastAccessValues] =
    await Promise.all([
      redis.mget(ids.map((id) => `client:online:${id}`)),
      redis.mget(ids.map((id) => `client:lastSeen:${id}`)),
      redis.mget(ids.map((id) => `client:ip:${id}`)),
      redis.mget(ids.map((id) => `client:version:${id}`)),
      redis.mget(ids.map((id) => `client:lastAccess:${id}`)),
    ]);

  return clients.map((client, index) => ({
    id: client.id,
    online: Boolean(onlineValues[index]),
    lastSeen: lastSeenValues[index] ?? null,
    ip: ipValues[index] ?? null,
    version: versionValues[index] ?? null,
    lastAccess: lastAccessValues[index] ?? null,
  }));
}

function attachWebSocketServer(server) {
  const wss = new WebSocketServer({ noServer: true });
  const statusWss = new WebSocketServer({ noServer: true });
  const statusConnections = new Set();

  server.on("upgrade", async (req, socket, head) => {
    if (req.url?.startsWith("/ws/status")) {
      console.log("[ws:status] upgrade", req.url);
      statusWss.handleUpgrade(req, socket, head, (ws) => {
        statusWss.emit("connection", ws, req);
      });
      return;
    }
    if (!req.url?.startsWith("/ws")) {
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", async (ws, req) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const key = url.searchParams.get("key");
      const version = url.searchParams.get("version");
      if (!key) {
        ws.close(4001, "Missing key");
        return;
      }

      const prefix = key.slice(0, 8);
      const keyCandidates = await prisma.clientKey.findMany({
        where: {
          keyPrefix: prefix,
          revokedAt: null,
        },
        include: { client: true },
      });

      let matched = null;
      for (const candidate of keyCandidates) {
        const ok = await bcrypt.compare(key, candidate.keyHash);
        if (ok) {
          matched = candidate;
          break;
        }
      }

      if (!matched) {
        ws.close(4003, "Invalid key");
        return;
      }

      const clientId = matched.clientId;
      ws.clientId = clientId;
      ws.clientVersion = version || null;
      const forwarded = req.headers["x-forwarded-for"];
      const ip =
        (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0].trim() ||
        req.socket?.remoteAddress;
      ws.clientIp = ip || null;
      registerConnection(clientId, ws);
      await redis.set(`client:online:${clientId}`, "1", "EX", ONLINE_TTL_SECONDS);
      await redis.set(
        `client:lastSeen:${clientId}`,
        new Date().toISOString(),
        "EX",
        STATUS_TTL_SECONDS
      );
      if (ws.clientVersion) {
        await redis.set(
          `client:version:${clientId}`,
          ws.clientVersion,
          "EX",
          STATUS_TTL_SECONDS
        );
      }
      if (ws.clientIp) {
        await redis.set(`client:ip:${clientId}`, ws.clientIp, "EX", STATUS_TTL_SECONDS);
      }

      ws.on("message", async (data) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload?.type === "heartbeat") {
            await redis.set(`client:online:${clientId}`, "1", "EX", ONLINE_TTL_SECONDS);
            await redis.set(
              `client:lastSeen:${clientId}`,
              new Date().toISOString(),
              "EX",
              STATUS_TTL_SECONDS
            );
            if (ws.clientVersion) {
              await redis.set(
                `client:version:${clientId}`,
                ws.clientVersion,
                "EX",
                STATUS_TTL_SECONDS
              );
            }
            if (ws.clientIp) {
              await redis.set(
                `client:ip:${clientId}`,
                ws.clientIp,
                "EX",
                STATUS_TTL_SECONDS
              );
            }
            return;
          }
          if (!payload?.id) {
            return;
          }
          if (!resolveProxyResponse(clientId, payload)) {
            ws.send(JSON.stringify({ id: payload.id, error: "Unknown request" }));
          }
        } catch (error) {
          ws.send(JSON.stringify({ error: "Invalid message" }));
        }
      });

      ws.on("close", async () => {
        unregisterConnection(clientId);
        await redis.del(`client:online:${clientId}`);
      });

      ws.on("error", () => {
        unregisterConnection(clientId);
      });
    } catch (error) {
      ws.close(1011, "Server error");
    }
  });

  statusWss.on("connection", async (ws, req) => {
    try {
      console.log("[ws:status] connection");
      const session = await getSessionFromRequest(req);
      if (!session) {
        console.log("[ws:status] unauthorized (no session)");
        ws.close(4001, "Unauthorized");
        return;
      }

      const isAdmin = await hasPermission(session.userId, "admin.users");
      const connection = { ws, userId: session.userId, isAdmin };
      statusConnections.add(connection);

      const snapshot = await getStatusSnapshot(connection);
      console.log(
        "[ws:status] send snapshot",
        "user=",
        session.userId,
        "admin=",
        isAdmin,
        "count=",
        snapshot.length
      );
      ws.send(JSON.stringify({ type: "status", clients: snapshot }));

      ws.on("close", () => {
        console.log("[ws:status] closed");
        statusConnections.delete(connection);
      });
      ws.on("error", (error) => {
        console.log("[ws:status] error", error?.message ?? error);
      });
    } catch (error) {
      console.log("[ws:status] server error", error?.message ?? error);
      ws.close(1011, "Server error");
    }
  });

  setInterval(async () => {
    for (const key of await redis.keys("client:online:*")) {
      const clientId = key.split(":").pop();
      if (!clientId) continue;
      const online = Boolean(require("../lib/tunnelRegistry").getConnection(clientId));
      if (online) {
        await redis.set(key, "1", "EX", ONLINE_TTL_SECONDS);
      }
    }
  }, 10000);

  setInterval(async () => {
    for (const connection of Array.from(statusConnections)) {
      if (connection.ws.readyState !== 1) continue;
      const snapshot = await getStatusSnapshot(connection);
      connection.ws.send(JSON.stringify({ type: "status", clients: snapshot }));
    }
  }, 5000);

  return wss;
}

module.exports = { attachWebSocketServer };
