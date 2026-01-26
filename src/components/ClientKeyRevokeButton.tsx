"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ClientKeyRevokeButton({
  clientId,
  keyId,
  disabled,
}: {
  clientId: string;
  keyId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const revoke = async () => {
    setSaving(true);
    await fetch(`/webvpn-api/clients/${clientId}/key/${keyId}`, {
      method: "PATCH",
    });
    setSaving(false);
    router.refresh();
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={revoke}
      disabled={saving || disabled}
    >
      {disabled ? "已禁用" : saving ? "处理中..." : "禁用"}
    </Button>
  );
}



