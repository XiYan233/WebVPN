"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export default function ClientSettingsForm({
  clientId,
  name,
  description,
  targetPort,
  basePath,
  isActive,
}: {
  clientId: string;
  name: string;
  description: string | null;
  targetPort: number;
  basePath: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [formState, setFormState] = useState({
    name,
    description: description ?? "",
    targetPort: String(targetPort),
    basePath,
    isActive,
  });

  const update = async () => {
    setSaving(true);
    await fetch(`/webvpn-api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formState.name,
        description: formState.description,
        targetPort: Number(formState.targetPort),
        basePath: formState.basePath,
        isActive: formState.isActive,
      }),
    });
    setSaving(false);
    router.refresh();
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={formState.name}
          onChange={(event) =>
            setFormState((prev) => ({ ...prev, name: event.target.value }))
          }
          placeholder="名称"
        />
        <Input
          value={formState.targetPort}
          onChange={(event) =>
            setFormState((prev) => ({ ...prev, targetPort: event.target.value }))
          }
          placeholder="内网端口"
          type="number"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={formState.basePath}
          onChange={(event) =>
            setFormState((prev) => ({ ...prev, basePath: event.target.value }))
          }
          placeholder="基础路径 /"
        />
        <Input
          value={formState.description}
          onChange={(event) =>
            setFormState((prev) => ({ ...prev, description: event.target.value }))
          }
          placeholder="描述"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={formState.isActive}
          onChange={(event) =>
            setFormState((prev) => ({
              ...prev,
              isActive: Boolean(event.target?.checked),
            }))
          }
        />
        启用客户端
      </label>
      <Button type="button" onClick={update} disabled={saving}>
        {saving ? "保存中..." : "保存设置"}
      </Button>
    </div>
  );
}

