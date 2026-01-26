"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ClientRow = {
  id: string;
  name: string;
  targetPort: number;
  isActive: boolean;
};

type ClientStatus = {
  online: boolean;
  lastSeen: string | null;
  ip: string | null;
  version: string | null;
  lastAccess: string | null;
};

type StatusMap = Record<string, ClientStatus>;

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

export default function ClientStatusTable({
  clients,
  initialStatus,
  isAdmin,
}: {
  clients: ClientRow[];
  initialStatus: StatusMap;
  isAdmin?: boolean;
}) {
  const [statusById, setStatusById] = useState<StatusMap>(initialStatus);
  const [connected, setConnected] = useState(false);
  const statusRef = useRef(statusById);

  useEffect(() => {
    statusRef.current = statusById;
  }, [statusById]);

  const wsUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/status`;
  }, []);

  const applyStatus = (clientsPayload: Array<any>) => {
    const next: StatusMap = { ...statusRef.current };
    for (const client of clientsPayload) {
      if (!client?.id) continue;
      next[client.id] = {
        online: Boolean(client.online),
        lastSeen: client.lastSeen ?? null,
        ip: client.ip ?? null,
        version: client.version ?? null,
        lastAccess: client.lastAccess ?? null,
      };
    }
    setStatusById(next);
  };

  useEffect(() => {
    if (!wsUrl) return;
    let active = true;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (!active) return;
      const ws = new WebSocket(wsUrl);
      socket = ws;

      ws.onopen = () => {
        if (!active) return;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type !== "status" || !Array.isArray(payload.clients)) return;
          applyStatus(payload.clients);
        } catch {
          // ignore invalid payloads
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setConnected(false);
        setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      active = false;
      socket?.close();
    };
  }, [wsUrl]);

  useEffect(() => {
    if (connected) return;
    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/webvpn-api/clients/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !Array.isArray(data?.clients)) return;
        applyStatus(data.clients);
      } catch {
        // ignore polling errors
      }
    };

    fetchStatus();
    const timer = setInterval(fetchStatus, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connected]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>名称</TableHead>
          <TableHead>端口</TableHead>
          <TableHead>启用</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>上次心跳</TableHead>
          <TableHead>IP</TableHead>
          <TableHead>版本</TableHead>
          <TableHead>最近访问</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clients.map((client) => {
          const status = statusById[client.id];
          return (
            <TableRow key={client.id}>
              <TableCell className="font-medium">{client.name}</TableCell>
              <TableCell>{client.targetPort}</TableCell>
              <TableCell>
                <Badge
                  className={
                    client.isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                  }
                >
                  {client.isActive ? "启用" : "禁用"}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  className={
                    status?.online
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-100 text-slate-600"
                  }
                >
                  {status?.online ? "在线" : "离线"}
                </Badge>
              </TableCell>
              <TableCell>{formatTime(status?.lastSeen)}</TableCell>
              <TableCell>{status?.ip ?? "-"}</TableCell>
              <TableCell>{status?.version ?? "-"}</TableCell>
              <TableCell>{formatTime(status?.lastAccess)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {isAdmin && (
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/clients/${client.id}`}>管理</Link>
                    </Button>
                  )}
                  <Button asChild size="sm">
                    <Link href={`/tunnel/${client.id}/`} target="_blank">
                      访问
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

