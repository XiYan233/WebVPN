"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Permission = { id: string; key: string; label: string };

export default function RolePermissionEditor({
  roleId,
  permissions,
  assignedPermissionIds,
}: {
  roleId: string;
  permissions: Permission[];
  assignedPermissionIds: string[];
}) {
  const [selected, setSelected] = useState<string[]>(assignedPermissionIds);
  const [saving, setSaving] = useState(false);

  const togglePermission = (permissionId: string) => {
    setSelected((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const save = async () => {
    setSaving(true);
    await fetch(`/api/admin/roles/${roleId}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionIds: selected }),
    });
    setSaving(false);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {permissions.map((permission) => (
          <label key={permission.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              type="checkbox"
              checked={selected.includes(permission.id)}
              onChange={() => togglePermission(permission.id)}
            />
            {permission.key}
          </label>
        ))}
      </div>
      <Button type="button" variant="secondary" onClick={save} disabled={saving}>
        {saving ? "保存中..." : "保存权限"}
      </Button>
    </div>
  );
}
