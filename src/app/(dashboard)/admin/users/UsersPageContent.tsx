"use client";

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
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ButtonSelect } from "@/components/ui/ButtonSelect";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
  const [success, setSuccess] = useState("");
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
    if (!showForm || form.role !== "WAREHOUSE_USER" || warehouses.length === 0)
      return;
    if (form.warehouseId && form.permissions.length > 0) return;
    const wh = warehouses[0].id;
    setForm((f) => ({
      ...f,
      warehouseId: wh,
      permissions: defaultWarehouseOperatorPermissions(wh),
    }));
  }, [
    showForm,
    form.role,
    form.warehouseId,
    form.permissions.length,
    warehouses,
  ]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

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
      setSuccess("User created");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSavePermissions() {
    if (!editing) return;

    if (editPermissions.length === 0) {
      setError(
        "Assign at least one module permission before saving. Use a quick preset if you are unsure."
      );
      return;
    }

    if (!hasWarehouseScopedPermission(editPermissions)) {
      setError(
        "Staff users need at least one warehouse permission (e.g. Stock in for their warehouse)."
      );
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await api.users.update(editing.id, { permissions: editPermissions });
      setEditing(null);
      setSuccess(
        `Access updated for ${editing.name}. They must log in again to use the new access.`
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update permissions"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: PublicUser) {
    setError("");
    setSuccess("");
    try {
      await api.users.update(user.id, { isActive: !user.isActive });
      setSuccess(
        user.isActive ? `${user.name} deactivated` : `${user.name} activated`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user");
    }
  }

  function openEditPermissions(user: PublicUser) {
    setEditing(user);
    const existing = user.permissions ?? [];
    if (
      existing.length === 0 &&
      user.role === "WAREHOUSE_USER" &&
      user.warehouseId
    ) {
      setEditPermissions(defaultWarehouseOperatorPermissions(user.warehouseId));
    } else {
      setEditPermissions(existing);
    }
    setShowForm(false);
    setSuccess("");
    setError("");
  }

  function summarizeAccess(user: PublicUser): {
    headline: string;
    modules: string[];
  } {
    if (user.role === "ADMIN") {
      return {
        headline: "Full access",
        modules: catalog.map((m) => m.label),
      };
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
    <div className="space-y-8">
      <PageHeader
        title="Users & access"
        description="Control what each person can do, module by module. Every change is recorded in the activity log."
        actions={
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={auditHref} variant="secondary" size="lg">
              Activity log
            </ButtonLink>
            <Button
              type="button"
              size="xl"
              variant={showForm ? "secondary" : "primary"}
              onClick={() => {
                setShowForm(!showForm);
                setEditing(null);
                setSuccess("");
                setError("");
              }}
            >
              {showForm ? "Cancel" : "Add user"}
            </Button>
          </div>
        }
      />

      <section>
        <h2 className="mb-3 text-lg font-bold text-stone-800">
          App modules
        </h2>
        <p className="mb-4 text-sm text-stone-500">
          These are the modules you can grant. Staff get only what you turn on;
          admins get everything.
        </p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {catalog.length === 0 && !loading
            ? null
            : (catalog.length > 0
                ? catalog
                : Array.from({ length: 8 }, (_, i) => ({
                    id: `skeleton-${i}`,
                    label: "…",
                    description: "",
                  }))
              ).map((mod) => (
                <div
                  key={mod.id}
                  className="rounded-2xl border-2 border-stone-200 bg-white px-4 py-4 shadow-sm"
                >
                  <p className="text-base font-bold text-stone-900 leading-snug">
                    {mod.label}
                  </p>
                  {"description" in mod && mod.description ? (
                    <p className="mt-1.5 line-clamp-2 text-xs text-stone-500">
                      {mod.description}
                    </p>
                  ) : null}
                </div>
              ))}
        </div>
      </section>

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

      <Alert message={error} />
      <Alert message={success} type="success" />

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-6 rounded-2xl border-2 border-stone-200 bg-white p-5 sm:p-6"
        >
          <h2 className="text-xl font-bold text-stone-900">New user</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Name"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
            />
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
              layout="grid"
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
                  label: "Staff",
                  sublabel: "Custom module access",
                },
                {
                  value: "ADMIN",
                  label: "Admin",
                  sublabel: "Full access",
                },
              ]}
            />
          </div>

          {form.role === "WAREHOUSE_USER" && (
            <>
              <div>
                <ButtonSelect
                  label="Home warehouse"
                  value={form.warehouseId}
                  layout="grid"
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
                <p className="mt-2 text-sm text-stone-500">
                  Default landing warehouse for dashboards and quick presets.
                </p>
              </div>
              <PermissionEditor
                value={form.permissions}
                onChange={(permissions) => setForm({ ...form, permissions })}
                warehouses={warehouses}
                homeWarehouseId={form.warehouseId}
                modules={catalog}
              />
            </>
          )}

          {form.role === "ADMIN" && (
            <p className="rounded-2xl border-2 border-stone-100 bg-stone-50 px-5 py-4 text-base text-stone-600">
              Admins can use every screen and action. Use staff accounts when you
              need limited module access.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="xl" loading={submitting}>
              {submitting ? "Creating…" : "Create user"}
            </Button>
            <Button
              type="button"
              size="xl"
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {editing && (
        <div className="space-y-6 rounded-2xl border-2 border-orange-300 bg-white p-5 sm:p-6">
          <div>
            <h2 className="text-xl font-bold text-stone-900">
              Edit access — {editing.name}
            </h2>
            <p className="mt-1 text-base text-stone-500">{editing.email}</p>
          </div>
          <PermissionEditor
            value={editPermissions}
            onChange={setEditPermissions}
            warehouses={warehouses}
            homeWarehouseId={editing.warehouseId ?? undefined}
            modules={catalog}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              size="xl"
              loading={submitting}
              onClick={() => void handleSavePermissions()}
            >
              {submitting ? "Saving…" : "Save access"}
            </Button>
            <Button
              type="button"
              size="xl"
              variant="secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-stone-800">People</h2>

        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner label="Loading users…" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-stone-200 px-6 py-12 text-center">
            <p className="text-base font-medium text-stone-500">No users yet</p>
            <Button
              type="button"
              size="lg"
              className="mt-4"
              onClick={() => {
                setShowForm(true);
                setEditing(null);
              }}
            >
              Add the first user
            </Button>
          </div>
        ) : (
          <ul className="space-y-4">
            {users.map((u) => {
              const access = summarizeAccess(u);
              const warehouseName =
                warehouses.find((w) => w.id === u.warehouseId)?.name ?? null;

              return (
                <li
                  key={u.id}
                  className="rounded-2xl border-2 border-stone-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-bold text-stone-900">
                          {u.name}
                        </h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            u.role === "ADMIN"
                              ? "bg-stone-800 text-white"
                              : "bg-orange-100 text-orange-900"
                          }`}
                        >
                          {u.role === "ADMIN" ? "Admin" : "Staff"}
                        </span>
                        <StatusBadge active={u.isActive} />
                      </div>
                      <p className="text-sm text-stone-500">{u.email}</p>
                      {warehouseName && u.role === "WAREHOUSE_USER" && (
                        <p className="text-sm font-medium text-stone-600">
                          Home warehouse:{" "}
                          <span className="font-bold text-stone-800">
                            {warehouseName}
                          </span>
                        </p>
                      )}

                      <div>
                        <p className="text-sm font-bold text-stone-700">
                          Module access · {access.headline}
                        </p>
                        {access.modules.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(u.role === "ADMIN"
                              ? access.modules.slice(0, 6)
                              : access.modules
                            ).map((label) => (
                              <span
                                key={label}
                                className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-900"
                              >
                                {label}
                              </span>
                            ))}
                            {u.role === "ADMIN" && access.modules.length > 6 && (
                              <span className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-semibold text-stone-600">
                                +{access.modules.length - 6} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-stone-400">
                            No modules granted yet
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row lg:flex-col lg:items-stretch">
                      {u.role === "WAREHOUSE_USER" && (
                        <Button
                          type="button"
                          size="lg"
                          variant={
                            editing?.id === u.id ? "outline" : "primary"
                          }
                          onClick={() => openEditPermissions(u)}
                        >
                          Edit access
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="lg"
                        variant={u.isActive ? "danger" : "outline"}
                        onClick={() => void toggleActive(u)}
                      >
                        {u.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border-2 border-stone-200 bg-stone-50/60 p-5">
      <p className="text-base font-bold text-stone-900">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{body}</p>
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
      <label className="block text-sm font-bold text-stone-700">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full min-h-12 rounded-2xl border-2 border-stone-200 bg-white px-4 py-3 text-base font-medium text-stone-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
      />
    </div>
  );
}
