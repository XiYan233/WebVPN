"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Role = { id: string; name: string };

export default function UserRoleEditor({
  userId,
  roles,
  assignedRoleIds,
}: {
  userId: string;
  roles: Role[];
  assignedRoleIds: string[];
}) {
  const [selected, setSelected] = useState<string[]>(assignedRoleIds);
  const [saving, setSaving] = useState(false);

  const toggleRole = (roleId: string) => {
    setSelected((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const save = async () => {
    setSaving(true);
    await fetch(`/webvpn-api/admin/users/${userId}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleIds: selected }),
    });
    setSaving(false);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {roles.map((role) => (
          <label key={role.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              type="checkbox"
              checked={selected.includes(role.id)}
              onChange={() => toggleRole(role.id)}
            />
            {role.name}
          </label>
        ))}
      </div>
      <Button type="button" variant="secondary" onClick={save} disabled={saving}>
        {saving ? "保存中..." : "保存角色"}
      </Button>
    </div>
  );
}

