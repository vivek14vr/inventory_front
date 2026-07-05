"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Warehouse } from "@/types/master";

const emptyForm = { name: "", code: "", editId: "" as string | null };

export default function AdminWarehousesPage() {
  const [items, setItems] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api.warehouses.list(true));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startCreate() {
    setForm(emptyForm);
    setShowForm(true);
    setSuccess("");
  }

  function startEdit(item: Warehouse) {
    setForm({ name: item.name, code: item.code, editId: item.id });
    setShowForm(true);
    setSuccess("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      if (form.editId) {
        await api.warehouses.update(form.editId, {
          name: form.name,
          code: form.code.toUpperCase(),
        });
        setSuccess("Warehouse updated");
      } else {
        await api.warehouses.create({
          name: form.name,
          code: form.code.toUpperCase(),
        });
        setSuccess("Warehouse created");
      }
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save warehouse");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(item: Warehouse) {
    setError("");
    try {
      await api.warehouses.update(item.id, { isActive: !item.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update warehouse");
    }
  }

  return (
    <MasterPage
      title="Warehouses"
      description="Manage warehouse locations. Vasai and Goregaon are seeded by default."
      showForm={showForm}
      onAdd={startCreate}
      onCancel={() => {
        setShowForm(false);
        setForm(emptyForm);
      }}
      formTitle={form.editId ? "Edit warehouse" : "New warehouse"}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      success={success}
      form={
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field
            label="Code"
            value={form.code}
            onChange={(v) => setForm({ ...form, code: v.toUpperCase() })}
            placeholder="e.g. VASAI"
            disabled={!!form.editId}
          />
        </div>
      }
    >
      <DataTable
        loading={loading}
        empty="No warehouses"
        headers={["Name", "Code", "Status", ""]}
        rows={items.map((w) => (
          <tr key={w.id} className="border-t border-zinc-100">
            <td className="px-4 py-3 font-medium">{w.name}</td>
            <td className="px-4 py-3 font-mono text-sm text-zinc-600">{w.code}</td>
            <td className="px-4 py-3">
              <StatusBadge active={w.isActive} />
            </td>
            <td className="px-4 py-3 text-right space-x-3">
              <button onClick={() => startEdit(w)} className="text-xs text-zinc-600 hover:text-zinc-900">
                Edit
              </button>
              <button onClick={() => toggleActive(w)} className="text-xs text-zinc-600 hover:text-zinc-900">
                {w.isActive ? "Deactivate" : "Activate"}
              </button>
            </td>
          </tr>
        ))}
      />
    </MasterPage>
  );
}

function MasterPage({
  title,
  description,
  children,
  showForm,
  onAdd,
  onCancel,
  formTitle,
  onSubmit,
  submitting,
  error,
  success,
  form,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  showForm: boolean;
  onAdd: () => void;
  onCancel: () => void;
  formTitle: string;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  error: string;
  success: string;
  form: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      <div className="flex justify-end">
        <button
          onClick={showForm ? onCancel : onAdd}
          className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800"
        >
          {showForm ? "Cancel" : `Add ${title.slice(0, -1).toLowerCase() || "item"}`}
        </button>
      </div>
      <Alert message={error} />
      <Alert message={success} type="success" />
      {showForm && (
        <form onSubmit={onSubmit} className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
          <h2 className="font-medium text-zinc-900">{formTitle}</h2>
          {form}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </form>
      )}
      {children}
    </div>
  );
}

function DataTable({
  loading,
  empty,
  headers,
  rows,
}: {
  loading: boolean;
  empty: string;
  headers: string[];
  rows: React.ReactNode[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-zinc-500">
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-zinc-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows
          )}
        </tbody>
      </table>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      <input
        required
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
      />
    </div>
  );
}
