"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UserAdminActions({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");

  const updateStatus = async (nextStatus: boolean) => {
    setSaving(true);
    await fetch(`/webvpn-api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: nextStatus }),
    });
    setSaving(false);
    router.refresh();
  };

  const resetPassword = async () => {
    if (!password.trim()) return;
    setSaving(true);
    await fetch(`/webvpn-api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setPassword("");
    setSaving(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={isActive ? "secondary" : "default"}
        onClick={() => updateStatus(!isActive)}
        disabled={saving}
      >
        {isActive ? "禁用" : "启用"}
      </Button>
      <div className="flex items-center gap-2">
        <Input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="新密码"
          type="password"
          className="h-9 w-32"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={resetPassword}
          disabled={saving}
        >
          重置密码
        </Button>
      </div>
    </div>
  );
}

