"use client";

import { useEffect, useState } from "react";
import { ButtonSelect } from "@/components/ui/ButtonSelect";
import { api, ApiError } from "@/lib/api/client";
import type { Warehouse } from "@/types/master";

type WarehouseSelectProps = {
  value: string;
  onChange: (warehouseId: string) => void;
  label?: string;
  required?: boolean;
  excludeWarehouseId?: string;
  /** When set, only these warehouses appear (module access). */
  allowedWarehouseIds?: string[];
  disabled?: boolean;
};

export function WarehouseSelect({
  value,
  onChange,
  label = "Warehouse",
  required = true,
  excludeWarehouseId,
  allowedWarehouseIds,
  disabled,
}: WarehouseSelectProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api.warehouses
      .list()
      .then((list) => {
        setWarehouses(list);
        setLoadError("");
      })
      .catch((err) => {
        setWarehouses([]);
        setLoadError(
          err instanceof ApiError ? err.message : "Could not load warehouses"
        );
      });
  }, []);

  let options = warehouses;
  if (allowedWarehouseIds?.length) {
    options = options.filter((w) => allowedWarehouseIds.includes(w.id));
  }
  if (excludeWarehouseId) {
    options = options.filter((w) => w.id !== excludeWarehouseId);
  }

  const buttonOptions = [
    ...(required ? [] : [{ value: "", label: "All" }]),
    ...options.map((w) => ({ value: w.id, label: w.name, sublabel: w.code })),
  ];

  return (
    <div>
      <ButtonSelect
        label={label}
        value={value}
        onChange={onChange}
        options={buttonOptions}
        disabled={disabled}
        emptyMessage="No warehouses available"
      />
      {loadError ? <p className="mt-1 text-xs text-red-600">{loadError}</p> : null}
    </div>
  );
}
