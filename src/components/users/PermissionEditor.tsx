"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import type {
  PermissionCode,
  PermissionGrant,
  PermissionModuleDefinition,
} from "@/lib/auth/permissions";

type Props = {
  value: PermissionGrant[];
  onChange: (grants: PermissionGrant[]) => void;
  warehouses: Array<{ id: string; name: string; code: string }>;
  homeWarehouseId?: string;
  disabled?: boolean;
};

function grantKey(g: PermissionGrant): string {
  return g.warehouseId ? `${g.code}:${g.warehouseId}` : g.code;
}

function isPermWarehouseScoped(
  mod: PermissionModuleDefinition,
  perm: PermissionModuleDefinition["permissions"][number]
): boolean {
  return perm.warehouseScoped ?? mod.warehouseScoped;
}

export function PermissionEditor({
  value,
  onChange,
  warehouses,
  homeWarehouseId,
  disabled,
}: Props) {
  const [modules, setModules] = useState<PermissionModuleDefinition[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    api.permissions
      .catalog()
      .then((r) => {
        setCatalogError("");
        setModules(r.modules);
        const open: Record<string, boolean> = {};
        for (const m of r.modules) open[m.id] = true;
        setExpanded(open);
      })
      .catch((err) => {
        setModules([]);
        setCatalogError(
          err instanceof ApiError
            ? err.message
            : "Could not load permission catalog"
        );
      });
  }, []);

  const warehouseById = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w])),
    [warehouses]
  );

  function isChecked(code: PermissionCode, warehouseId?: string): boolean {
    return value.some(
      (g) =>
        g.code === code &&
        (warehouseId ? g.warehouseId === warehouseId : !g.warehouseId)
    );
  }

  function toggle(code: PermissionCode, warehouseId?: string) {
    const key = warehouseId ? `${code}:${warehouseId}` : code;
    if (value.some((g) => grantKey(g) === key)) {
      onChange(value.filter((g) => grantKey(g) !== key));
      return;
    }
    onChange([...value, { code, ...(warehouseId ? { warehouseId } : {}) }]);
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
    onChange([
      { code: "dashboard.view" },
      { code: "stock.view", warehouseId: wh },
      { code: "stock.in", warehouseId: wh },
      { code: "stock.out", warehouseId: wh },
      { code: "transfers.view", warehouseId: wh },
      { code: "transfers.receive", warehouseId: wh },
      { code: "checklists.complete" },
    ]);
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

  return (
    <div className="space-y-4">
      {catalogError ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {catalogError}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">Quick presets</p>
        <p className="mt-1 text-xs text-zinc-500">
          Start from a common role, then fine-tune each module below. Warehouse
          presets use the home warehouse.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <PresetButton
            disabled={disabled || !warehouses.length}
            onClick={() => applyPreset("warehouse-operator")}
            label="Warehouse operator"
            hint="Home, stock, transfers, daily tasks"
          />
          <PresetButton
            disabled={disabled || !warehouses.length}
            onClick={() => applyPreset("stock-only")}
            label="Stock in/out only"
            hint="Minimal counter access"
          />
          <PresetButton
            disabled={disabled}
            onClick={() => applyPreset("clear")}
            label="Clear all"
            hint="Remove every grant"
          />
        </div>
      </div>

      {value.length > 0 && (
        <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-800">
            Selected access ({value.length})
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {value.map((g) => (
              <li
                key={grantKey(g)}
                className="rounded-full bg-white px-2.5 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-orange-100"
              >
                {formatGrantLabel(g)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        {modules.map((mod) => {
          const selected = grantsForModule(mod).length;
          const isOpen = expanded[mod.id] !== false;

          return (
            <div
              key={mod.id}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
            >
              <div className="flex items-start justify-between gap-3 border-b border-zinc-100 bg-zinc-50/80 px-4 py-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [mod.id]: !isOpen }))
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                    <h3 className="text-sm font-semibold text-zinc-900">
                      {mod.label}
                    </h3>
                    {selected > 0 && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                        {selected} on
                      </span>
                    )}
                  </div>
                  <p className="mt-1 pl-5 text-xs text-zinc-500">
                    {mod.description}
                  </p>
                </button>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => selectAllInModule(mod)}
                    className="text-xs font-medium text-orange-700 hover:text-orange-900 disabled:opacity-50"
                  >
                    Grant all
                  </button>
                  <button
                    type="button"
                    disabled={disabled || selected === 0}
                    onClick={() => clearModule(mod)}
                    className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
                  >
                    Revoke all
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="space-y-4 p-4">
                  {mod.permissions.map((perm) => {
                    const scoped = isPermWarehouseScoped(mod, perm);

                    if (!scoped) {
                      return (
                        <PermissionRow
                          key={perm.code}
                          checked={isChecked(perm.code)}
                          disabled={disabled}
                          label={perm.label}
                          description={perm.description}
                          example={perm.example}
                          onToggle={() => toggle(perm.code)}
                        />
                      );
                    }

                    return (
                      <div
                        key={perm.code}
                        className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3"
                      >
                        <p className="text-sm font-medium text-zinc-900">
                          {perm.label}
                        </p>
                        {perm.description && (
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {perm.description}
                          </p>
                        )}
                        {perm.example && (
                          <p className="mt-1 text-xs italic text-zinc-400">
                            e.g. {perm.example}
                          </p>
                        )}
                        <p className="mt-2 text-xs font-medium text-zinc-600">
                          Choose warehouse
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {warehouses.map((w) => (
                            <label
                              key={`${perm.code}-${w.id}`}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                                isChecked(perm.code, w.id)
                                  ? "border-orange-300 bg-orange-50 text-orange-900"
                                  : "border-zinc-200 bg-white text-zinc-700"
                              }`}
                            >
                              <input
                                type="checkbox"
                                disabled={disabled}
                                checked={isChecked(perm.code, w.id)}
                                onChange={() => toggle(perm.code, w.id)}
                                className="rounded border-zinc-300"
                              />
                              <span>
                                {w.name}
                                <span className="ml-1 text-xs text-zinc-400">
                                  ({w.code})
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PresetButton({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left hover:bg-zinc-100 disabled:opacity-50"
    >
      <span className="block text-xs font-semibold text-zinc-800">{label}</span>
      <span className="block text-[11px] text-zinc-500">{hint}</span>
    </button>
  );
}

function PermissionRow({
  checked,
  disabled,
  label,
  description,
  example,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  example?: string;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
        checked
          ? "border-orange-300 bg-orange-50/50"
          : "border-zinc-100 bg-white"
      }`}
    >
      <input
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 rounded border-zinc-300"
      />
      <span className="min-w-0">
        <span className="text-sm font-medium text-zinc-900">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-zinc-500">
            {description}
          </span>
        )}
        {example && (
          <span className="mt-1 block text-xs italic text-zinc-400">
            e.g. {example}
          </span>
        )}
      </span>
    </label>
  );
}
