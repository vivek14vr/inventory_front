"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import {
  defaultWarehouseOperatorPermissions,
  isAdminOnlyPermission,
  MANAGE_IMPLIES_VIEW,
  VIEW_IMPLIED_BY_MANAGE,
  type PermissionCode,
  type PermissionGrant,
  type PermissionModuleDefinition,
} from "@/lib/auth/permissions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

type Props = {
  value: PermissionGrant[];
  onChange: (grants: PermissionGrant[]) => void;
  warehouses: Array<{ id: string; name: string; code: string }>;
  homeWarehouseId?: string;
  /** Prefer passing catalog from the parent to avoid a second fetch. */
  modules?: PermissionModuleDefinition[];
  disabled?: boolean;
};

type PermDef = PermissionModuleDefinition["permissions"][number];

function grantKey(g: PermissionGrant): string {
  return g.warehouseId ? `${g.code}:${g.warehouseId}` : g.code;
}

function isPermWarehouseScoped(
  mod: PermissionModuleDefinition,
  perm: PermDef
): boolean {
  return perm.warehouseScoped ?? mod.warehouseScoped;
}

export function PermissionEditor({
  value,
  onChange,
  warehouses,
  homeWarehouseId,
  modules: modulesProp,
  disabled,
}: Props) {
  const [fetchedModules, setFetchedModules] = useState<
    PermissionModuleDefinition[]
  >([]);
  /** Only one module open at a time — keeps the page scannable. */
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [initializedOpen, setInitializedOpen] = useState(false);

  useEffect(() => {
    if (modulesProp && modulesProp.length > 0) {
      setFetchedModules(modulesProp);
      return;
    }

    api.permissions
      .catalog()
      .then((r) => {
        setCatalogError("");
        setFetchedModules(r.modules);
      })
      .catch((err) => {
        setFetchedModules([]);
        setCatalogError(
          err instanceof ApiError
            ? err.message
            : "Could not load permission catalog"
        );
      });
  }, [modulesProp]);

  const modules = useMemo(() => {
    const raw = modulesProp?.length ? modulesProp : fetchedModules;
    // Staff cannot hold admin-power grants — hide them from the editor.
    return raw
      .map((mod) => ({
        ...mod,
        permissions: mod.permissions.filter(
          (p) => !isAdminOnlyPermission(p.code)
        ),
      }))
      .filter((mod) => mod.permissions.length > 0);
  }, [modulesProp, fetchedModules]);

  const mainModules = useMemo(
    () => modules.filter((m) => (m.navGroup ?? "main") === "main"),
    [modules]
  );
  const moreModules = useMemo(
    () => modules.filter((m) => m.navGroup === "more"),
    [modules]
  );

  // Open the first module that already has grants (or first main module).
  useEffect(() => {
    if (initializedOpen || modules.length === 0) return;
    const withGrants = modules.find((mod) => {
      const codes = new Set(mod.permissions.map((p) => p.code));
      return value.some((g) => codes.has(g.code));
    });
    setOpenModuleId(withGrants?.id ?? modules[0]?.id ?? null);
    setInitializedOpen(true);
  }, [modules, value, initializedOpen]);

  // Strip legacy admin-only grants from the editor value.
  useEffect(() => {
    const cleaned = value.filter((g) => !isAdminOnlyPermission(g.code));
    if (cleaned.length !== value.length) onChange(cleaned);
  }, [value, onChange]);

  const warehouseById = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w])),
    [warehouses]
  );

  function isChecked(code: PermissionCode, warehouseId?: string): boolean {
    if (
      value.some(
        (g) =>
          g.code === code &&
          (warehouseId ? g.warehouseId === warehouseId : !g.warehouseId)
      )
    ) {
      return true;
    }
    // Manage implies View for company master-data modules.
    if (!warehouseId) {
      const manageCode = VIEW_IMPLIED_BY_MANAGE[code];
      if (
        manageCode &&
        value.some((g) => g.code === manageCode && !g.warehouseId)
      ) {
        return true;
      }
    }
    return false;
  }

  function toggle(code: PermissionCode, warehouseId?: string) {
    if (warehouseId) {
      const key = `${code}:${warehouseId}`;
      if (value.some((g) => grantKey(g) === key)) {
        onChange(value.filter((g) => grantKey(g) !== key));
        return;
      }
      onChange([...value, { code, warehouseId }]);
      return;
    }

    const impliedView = MANAGE_IMPLIES_VIEW[code];
    const manageForView = VIEW_IMPLIED_BY_MANAGE[code];
    const hasExact = value.some((g) => g.code === code && !g.warehouseId);

    // Turning Manage off → keep View (read-only).
    if (impliedView && hasExact) {
      const next = value.filter((g) => !(g.code === code && !g.warehouseId));
      if (!next.some((g) => g.code === impliedView && !g.warehouseId)) {
        next.push({ code: impliedView });
      }
      onChange(next);
      return;
    }

    // Turning View off → also clear Manage.
    if (manageForView && isChecked(code)) {
      onChange(
        value.filter(
          (g) =>
            !(!g.warehouseId && (g.code === code || g.code === manageForView))
        )
      );
      return;
    }

    // Turning something off that isn't a view/manage pair.
    if (hasExact) {
      onChange(value.filter((g) => !(g.code === code && !g.warehouseId)));
      return;
    }

    // Turning on: Manage also adds View.
    const next = [...value, { code }];
    if (
      impliedView &&
      !next.some((g) => g.code === impliedView && !g.warehouseId)
    ) {
      next.push({ code: impliedView });
    }
    onChange(next);
  }

  function grantsForModule(mod: PermissionModuleDefinition): PermissionGrant[] {
    const codes = new Set(mod.permissions.map((p) => p.code));
    return value.filter((g) => codes.has(g.code));
  }

  function setModuleGrants(
    mod: PermissionModuleDefinition,
    nextForModule: PermissionGrant[]
  ) {
    const codes = new Set(mod.permissions.map((p) => p.code));
    const rest = value.filter((g) => !codes.has(g.code));
    onChange([...rest, ...nextForModule]);
  }

  function selectAllInModule(mod: PermissionModuleDefinition) {
    const wh = homeWarehouseId ?? warehouses[0]?.id;
    const next: PermissionGrant[] = [];
    for (const perm of mod.permissions) {
      if (isPermWarehouseScoped(mod, perm)) {
        if (!wh) continue;
        next.push({ code: perm.code, warehouseId: wh });
      } else {
        next.push({ code: perm.code });
      }
    }
    setModuleGrants(mod, next);
  }

  function clearModule(mod: PermissionModuleDefinition) {
    setModuleGrants(mod, []);
  }

  function applyPreset(preset: "stock-only" | "warehouse-operator" | "clear") {
    const wh = homeWarehouseId ?? warehouses[0]?.id;
    if (preset === "clear") {
      onChange([]);
      return;
    }
    if (!wh) return;
    if (preset === "stock-only") {
      onChange([
        { code: "stock.in", warehouseId: wh },
        { code: "stock.out", warehouseId: wh },
      ]);
      return;
    }
    onChange(defaultWarehouseOperatorPermissions(wh));
  }

  function formatGrantLabel(g: PermissionGrant): string {
    for (const mod of modules) {
      const perm = mod.permissions.find((p) => p.code === g.code);
      if (perm) {
        const wh = g.warehouseId ? warehouseById.get(g.warehouseId) : undefined;
        return wh ? `${perm.label} · ${wh.name}` : perm.label;
      }
    }
    return g.code;
  }

  function moduleNameForGrant(g: PermissionGrant): string | null {
    for (const mod of modules) {
      if (mod.permissions.some((p) => p.code === g.code)) return mod.label;
    }
    return null;
  }

  function renderModuleCard(mod: PermissionModuleDefinition) {
    const selected = grantsForModule(mod).length;
    const isOpen = openModuleId === mod.id;
    const warehousePerms = mod.permissions.filter((p) =>
      isPermWarehouseScoped(mod, p)
    );
    const companyPerms = mod.permissions.filter(
      (p) => !isPermWarehouseScoped(mod, p)
    );

    return (
      <div
        key={mod.id}
        className={`overflow-hidden rounded-2xl border-2 bg-white transition ${
          selected > 0
            ? "border-orange-300 shadow-sm shadow-orange-900/5"
            : "border-stone-200"
        }`}
      >
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() =>
              setOpenModuleId((id) => (id === mod.id ? null : mod.id))
            }
            aria-expanded={isOpen}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg text-stone-400" aria-hidden>
                {isOpen ? "▾" : "▸"}
              </span>
              <h4 className="text-xl font-bold text-stone-900">{mod.label}</h4>
              {selected > 0 ? (
                <span className="rounded-full bg-orange-600 px-3 py-1 text-xs font-bold text-white">
                  {selected} allowed
                </span>
              ) : (
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500">
                  No access
                </span>
              )}
            </div>
            {!isOpen && (
              <p className="mt-1.5 line-clamp-1 text-sm text-stone-500 sm:pl-7">
                {mod.description}
              </p>
            )}
          </button>

          {isOpen && (
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={disabled}
                onClick={() => selectAllInModule(mod)}
              >
                Allow all
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                disabled={disabled || selected === 0}
                onClick={() => clearModule(mod)}
              >
                Clear module
              </Button>
            </div>
          )}
        </div>

        {isOpen && (
          <div className="space-y-6 border-t border-stone-100 p-4 sm:p-5">
            <p className="text-sm text-stone-500">{mod.description}</p>

            {warehousePerms.length > 0 && (
              <div className="space-y-4">
                <div className="rounded-xl bg-amber-50 px-4 py-3">
                  <p className="text-sm font-bold text-amber-950">
                    At a warehouse
                  </p>
                  <p className="mt-0.5 text-sm text-amber-900/80">
                    Tap a warehouse to allow that action there. Leave warehouses
                    white if they should not have access.
                  </p>
                </div>

                {warehousePerms.map((perm) => (
                  <div
                    key={perm.code}
                    className="rounded-2xl border-2 border-stone-100 bg-stone-50/60 p-4"
                  >
                    <p className="text-base font-bold text-stone-900">
                      {perm.label}
                    </p>
                    {perm.description && (
                      <p className="mt-1 text-sm text-stone-500">
                        {perm.description}
                      </p>
                    )}
                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      {warehouses.map((w) => {
                        const active = isChecked(perm.code, w.id);
                        return (
                          <button
                            key={`${perm.code}-${w.id}`}
                            type="button"
                            disabled={disabled}
                            aria-pressed={active}
                            onClick={() => toggle(perm.code, w.id)}
                            className={`flex min-h-14 flex-col items-start justify-center rounded-2xl border-2 px-5 py-3 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                              active
                                ? "border-orange-600 bg-orange-600 text-white shadow-md shadow-orange-900/20"
                                : "border-stone-200 bg-white text-stone-700 hover:border-orange-300 hover:bg-orange-50"
                            }`}
                          >
                            <span className="text-base font-bold leading-tight">
                              {w.name}
                            </span>
                            <span
                              className={`text-xs font-semibold ${
                                active ? "text-orange-100" : "text-stone-400"
                              }`}
                            >
                              {active ? "Allowed" : "Not allowed"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {companyPerms.length > 0 && (
              <div className="space-y-3">
                <div className="rounded-xl bg-stone-100 px-4 py-3">
                  <p className="text-sm font-bold text-stone-900">
                    Whole company
                  </p>
                  <p className="mt-0.5 text-sm text-stone-600">
                    These apply everywhere — no warehouse pick needed. Usually
                    for admins or senior staff only.
                  </p>
                </div>

                {companyPerms.map((perm) => (
                  <ToggleActionButton
                    key={perm.code}
                    active={isChecked(perm.code)}
                    disabled={disabled}
                    label={perm.label}
                    description={perm.description}
                    onToggle={() => toggle(perm.code)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert message={catalogError} />

      <section className="rounded-2xl border-2 border-stone-200 bg-white p-5 sm:p-6">
        <h3 className="text-lg font-bold text-stone-900">Quick start</h3>
        <p className="mt-1 text-sm text-stone-500">
          Pick a common role first. Then open one module at a time to fine-tune.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <PresetTile
            disabled={disabled || !warehouses.length}
            onClick={() => applyPreset("warehouse-operator")}
            title="Warehouse staff"
            hint="Home, Stock In/Out, Check Stock, Return, Transfer receive"
          />
          <PresetTile
            disabled={disabled || !warehouses.length}
            onClick={() => applyPreset("stock-only")}
            title="Stock In / Out only"
            hint="Minimal counter access"
          />
          <PresetTile
            disabled={disabled}
            onClick={() => applyPreset("clear")}
            title="Clear all"
            hint="Remove every grant"
            danger
          />
        </div>
      </section>

      {value.length > 0 && (
        <section className="rounded-2xl border-2 border-orange-200 bg-orange-50/70 p-5">
          <p className="text-sm font-bold text-orange-900">
            Currently granted · {value.length}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {value.map((g) => {
              const modName = moduleNameForGrant(g);
              return (
                <li
                  key={grantKey(g)}
                  className="rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm shadow-sm"
                >
                  {modName && (
                    <span className="block text-xs font-semibold text-orange-700">
                      {modName}
                    </span>
                  )}
                  <span className="font-medium text-stone-800">
                    {formatGrantLabel(g)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-stone-900">Modules</h3>
          <p className="mt-1 text-sm text-stone-500">
            Same order as the sidebar. Tap a module to open it. Orange warehouse
            buttons mean “allowed at that location.” Company-wide actions do not
            need a warehouse.
          </p>
        </div>

        {mainModules.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-stone-400">
              Main menu
            </h4>
            {mainModules.map(renderModuleCard)}
          </div>
        )}

        {moreModules.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-stone-400">
              More
            </h4>
            {moreModules.map(renderModuleCard)}
          </div>
        )}
      </section>
    </div>
  );
}

function PresetTile({
  title,
  hint,
  disabled,
  onClick,
  danger,
}: {
  title: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-20 flex-col items-start justify-center rounded-2xl border-2 px-5 py-4 text-left transition active:scale-[0.98] disabled:opacity-50 ${
        danger
          ? "border-stone-200 bg-white text-stone-700 hover:border-red-300 hover:bg-red-50"
          : "border-stone-200 bg-stone-50 text-stone-800 hover:border-orange-300 hover:bg-orange-50"
      }`}
    >
      <span className="text-base font-bold">{title}</span>
      <span className="mt-0.5 text-sm text-stone-500">{hint}</span>
    </button>
  );
}

function ToggleActionButton({
  active,
  disabled,
  label,
  description,
  onToggle,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onToggle}
      className={`flex w-full min-h-16 items-start gap-4 rounded-2xl border-2 px-5 py-4 text-left transition active:scale-[0.99] disabled:opacity-50 ${
        active
          ? "border-orange-600 bg-orange-50 shadow-sm shadow-orange-900/10"
          : "border-stone-200 bg-white hover:border-orange-300 hover:bg-orange-50/50"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
          active
            ? "bg-orange-600 text-white"
            : "border-2 border-stone-300 bg-white text-stone-400"
        }`}
        aria-hidden
      >
        {active ? "✓" : ""}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-stone-900">{label}</span>
        {description && (
          <span className="mt-1 block text-sm text-stone-500">{description}</span>
        )}
      </span>
      <span
        className={`shrink-0 self-center rounded-full px-3 py-1.5 text-xs font-bold ${
          active ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-500"
        }`}
      >
        {active ? "Allowed" : "Not allowed"}
      </span>
    </button>
  );
}
