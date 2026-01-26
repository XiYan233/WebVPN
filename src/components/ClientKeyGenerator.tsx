"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ClientKeyGenerator({ clientId }: { clientId: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    setKey(null);
    const res = await fetch(`/webvpn-api/clients/${clientId}/key`, {
      method: "POST",
    });
    const data = await res.json();
    setKey(data.key ?? null);
    setLoading(false);
  };

  return (
    <div className="grid gap-4">
      <Button type="button" onClick={generate} disabled={loading}>
        {loading ? "生成中..." : "生成新 Key"}
      </Button>
      {key && (
        <Card className="border-dashed bg-secondary/40">
          <CardHeader>
            <CardTitle>新 Key</CardTitle>
            <CardDescription>请立即保存，该 Key 只显示一次。</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="break-all text-sm font-semibold text-foreground">{key}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}



