"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import {
  defaultWarehouseOperatorPermissions,
  hasWarehouseScopedPermission,
  type PermissionGrant,
  type PermissionModuleDefinition,
} from "@/lib/auth/permissions";
import { ButtonSelect } from "@/components/ui/ButtonSelect";
import { PermissionEditor } from "@/components/users/PermissionEditor";
import type { PublicUser } from "@/types/auth";

type Warehouse = { id: string; name: string; code: string };

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "WAREHOUSE_USER" as "ADMIN" | "WAREHOUSE_USER",
  warehouseId: "",
  permissions: [] as PermissionGrant[],
};

export function UsersPageContent() {
  const pathname = usePathname();
  const auditHref = pathname?.startsWith("/app")
    ? AUTH_ROUTES.appAudit
    : AUTH_ROUTES.adminAudit;
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [catalog, setCatalog] = useState<PermissionModuleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [editPermissions, setEditPermissions] = useState<PermissionGrant[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [userList, warehouseList, permCatalog] = await Promise.all([
        api.users.list(),
        api.warehouses.list(),
        api.permissions.catalog(),
      ]);
      setUsers(userList);
      setWarehouses(warehouseList);
      setCatalog(permCatalog.modules);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!showForm || form.role !== "WAREHOUSE_USER" || warehouses.length === 0) return;
    if (form.warehouseId && form.permissions.length > 0) return;
    const wh = warehouses[0].id;
    setForm((f) => ({
      ...f,
      warehouseId: wh,
      permissions: defaultWarehouseOperatorPermissions(wh),
    }));
  }, [showForm, form.role, form.warehouseId, form.permissions.length, warehouses]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    if (
      form.role === "WAREHOUSE_USER" &&
      !hasWarehouseScopedPermission(form.permissions)
    ) {
      setError(
        "Staff users need at least one warehouse-scoped permission (e.g. Stock in for their home warehouse)."
      );
      setSubmitting(false);
      return;
    }

    try {
      await api.users.create({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        warehouseId:
          form.role === "WAREHOUSE_USER" ? form.warehouseId || undefined : undefined,
        permissions:
          form.role === "WAREHOUSE_USER" ? form.permissions : undefined,
      });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSavePermissions() {
    if (!editing) return;

    if (
      editPermissions.length > 0 &&
      !hasWarehouseScopedPermission(editPermissions)
    ) {
      setError(
        "Staff users need at least one warehouse-scoped permission (e.g. Stock in for their warehouse)."
      );
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await api.users.update(editing.id, { permissions: editPermissions });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update permissions");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: PublicUser) {
    setError("");
    try {
      await api.users.update(user.id, { isActive: !user.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user");
    }
  }

  function openEditPermissions(user: PublicUser) {
    setEditing(user);
    setEditPermissions(user.permissions ?? []);
    setShowForm(false);
  }

  function summarizeAccess(user: PublicUser): { headline: string; modules: string[] } {
    if (user.role === "ADMIN") {
      return { headline: "Full access", modules: ["All modules"] };
    }
    const grants = user.permissions ?? [];
    if (grants.length === 0) {
      return { headline: "No access", modules: [] };
    }

    const moduleLabels: string[] = [];
    for (const mod of catalog) {
      const codes = new Set(mod.permissions.map((p) => p.code));
      const count = grants.filter((g) => codes.has(g.code)).length;
      if (count > 0) moduleLabels.push(mod.label);
    }

    return {
      headline: `${grants.length} grant${grants.length === 1 ? "" : "s"}`,
      modules: moduleLabels.length ? moduleLabels : ["Custom"],
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Users & access</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Control what each staff member can do, module by module. Grant or revoke
            individual actions (e.g. Stock in at Goregaon only). Every change is
            recorded in the{" "}
            <Link
              href={auditHref}
              className="font-medium text-orange-700 hover:text-orange-900"
            >
              activity log
            </Link>
            .
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditing(null);
          }}
          className="shrink-0 rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800"
        >
          {showForm ? "Cancel" : "Add user"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <InfoCard
          title="Admin"
          body="Full access to every module. No per-action setup needed."
        />
        <InfoCard
          title="Staff"
          body="Custom grants per module. Warehouse actions apply to specific locations."
        />
        <InfoCard
          title="Audit trail"
          body="Permission grants and revokes appear as “User permissions updated” in the activity log."
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6"
        >
          <h2 className="text-lg font-medium text-zinc-900">New user</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
            />
            <Field
              label="Password"
              type="password"
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
            />
            <ButtonSelect
              label="Role"
              value={form.role}
              onChange={(v) =>
                setForm({
                  ...form,
                  role: v as "ADMIN" | "WAREHOUSE_USER",
                  permissions: [],
                })
              }
              options={[
                {
                  value: "WAREHOUSE_USER",
                  label: "Staff (custom module access)",
                },
                { value: "ADMIN", label: "Admin (full access)" },
              ]}
            />
          </div>

          {form.role === "WAREHOUSE_USER" && (
            <>
              <div>
                <ButtonSelect
                  label="Home warehouse"
                  value={form.warehouseId}
                  onChange={(warehouseId) => {
                    setForm((f) => ({
                      ...f,
                      warehouseId,
                      permissions: warehouseId
                        ? defaultWarehouseOperatorPermissions(warehouseId)
                        : [],
                    }));
                  }}
                  options={warehouses.map((w) => ({
                    value: w.id,
                    label: w.name,
                    sublabel: w.code,
                  }))}
                  emptyMessage="No warehouses available"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Default landing warehouse for dashboards and quick presets. Password
                  is hashed on the server only.
                </p>
              </div>
              <PermissionEditor
                value={form.permissions}
                onChange={(permissions) => setForm({ ...form, permissions })}
                warehouses={warehouses}
                homeWarehouseId={form.warehouseId}
              />
            </>
          )}

          {form.role === "ADMIN" && (
            <p className="rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              Admins can use every screen and action. Use staff accounts when you
              need limited access.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create user"}
          </button>
        </form>
      )}

      {editing && (
        <div className="space-y-4 rounded-xl border border-orange-200 bg-white p-6">
          <div>
            <h2 className="text-lg font-medium text-zinc-900">
              Edit access — {editing.name}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">{editing.email}</p>
          </div>
          <PermissionEditor
            value={editPermissions}
            onChange={setEditPermissions}
            warehouses={warehouses}
            homeWarehouseId={editing.warehouseId ?? undefined}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSavePermissions()}
              className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save access"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Module access</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const access = summarizeAccess(u);
                return (
                  <tr key={u.id} className="border-t border-zinc-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">{u.name}</p>
                      <p className="text-xs text-zinc-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.role === "ADMIN"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {u.role === "ADMIN" ? "Admin" : "Staff"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-800">{access.headline}</p>
                      {access.modules.length > 0 && (
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {access.modules.slice(0, 4).join(" · ")}
                          {access.modules.length > 4
                            ? ` · +${access.modules.length - 4} more`
                            : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          u.isActive
                            ? "bg-orange-100 text-orange-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="space-x-3 px-4 py-3 text-right">
                      {u.role === "WAREHOUSE_USER" && (
                        <button
                          type="button"
                          onClick={() => openEditPermissions(u)}
                          className="text-xs font-medium text-orange-700 hover:text-orange-900"
                        >
                          Edit access
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleActive(u)}
                        className="text-xs text-zinc-600 hover:text-zinc-900"
                      >
                        {u.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{body}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
