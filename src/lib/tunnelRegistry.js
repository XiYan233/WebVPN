const crypto = require("crypto");

const registryKey = Symbol.for("webvpn.tunnelRegistry");
const registry =
  globalThis[registryKey] ||
  (globalThis[registryKey] = {
    connections: new Map(),
  });

const { connections } = registry;

function registerConnection(clientId, ws) {
  connections.set(clientId, { ws, pending: new Map() });
}

function unregisterConnection(clientId) {
  const existing = connections.get(clientId);
  if (existing) {
    for (const [, pending] of existing.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Connection closed"));
    }
  }
  connections.delete(clientId);
}

function getConnection(clientId) {
  return connections.get(clientId);
}

function createProxyRequest(clientId, payload, timeoutMs = 15000) {
  const conn = connections.get(clientId);
  if (!conn) {
    return null;
  }

  const id = crypto.randomUUID();
  const message = JSON.stringify({ id, ...payload });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      conn.pending.delete(id);
      reject(new Error("Proxy timeout"));
    }, timeoutMs);

    conn.pending.set(id, { resolve, reject, timeout });
    conn.ws.send(message, (error) => {
      if (error) {
        clearTimeout(timeout);
        conn.pending.delete(id);
        reject(error);
      }
    });
  });
}

function resolveProxyResponse(clientId, payload) {
  const conn = connections.get(clientId);
  if (!conn) {
    return false;
  }
  const pending = conn.pending.get(payload.id);
  if (!pending) {
    return false;
  }
  clearTimeout(pending.timeout);
  conn.pending.delete(payload.id);
  pending.resolve(payload);
  return true;
}

module.exports = {
  registerConnection,
  unregisterConnection,
  getConnection,
  createProxyRequest,
  resolveProxyResponse,
};
