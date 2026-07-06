"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatSecondaryName } from "@/lib/products/productNames";
import type { Client } from "@/types/master";

export default function AdminClientsPage() {
  const [items, setItems] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [secondaryName, setSecondaryName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api.clients.list(true));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setName("");
    setSecondaryName("");
    setEditId(null);
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const trimmedSecondary = secondaryName.trim();
      if (editId) {
        await api.clients.update(editId, {
          name: name.trim(),
          secondaryName: trimmedSecondary ? trimmedSecondary : null,
        });
        setSuccess("Client updated");
      } else {
        await api.clients.create({
          name: name.trim(),
          secondaryName: trimmedSecondary || undefined,
        });
        setSuccess("Client created");
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save client");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(item: Client) {
    setError("");
    try {
      await api.clients.update(item.id, { isActive: !item.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update client");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Clients</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Maintain a master list of clients with a primary name and optional secondary name.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {
            if (showForm) {
              resetForm();
            } else {
              setShowForm(true);
            }
          }}
          className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800"
        >
          {showForm ? "Cancel" : "Add client"}
        </button>
      </div>

      <Alert message={error} />
      <Alert message={success} type="success" />

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6"
        >
          <h2 className="font-medium text-zinc-900">
            {editId ? "Edit client" : "New client"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Primary name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder="e.g. Acme Corp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Secondary name</label>
              <input
                value={secondaryName}
                onChange={(e) => setSecondaryName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder="e.g. Acme Mumbai branch"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Primary name</th>
              <th className="px-4 py-3">Secondary name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  No clients yet
                </td>
              </tr>
            ) : (
              items.map((client) => (
                <tr key={client.id} className="border-t border-zinc-100">
                  <td className="px-4 py-3 font-medium text-zinc-900">{client.name}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {formatSecondaryName(client.secondaryName)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge active={client.isActive} />
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setEditId(client.id);
                        setName(client.name);
                        setSecondaryName(client.secondaryName ?? "");
                        setShowForm(true);
                      }}
                      className="text-xs text-zinc-600 hover:text-zinc-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(client)}
                      className="text-xs text-zinc-600 hover:text-zinc-900"
                    >
                      {client.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
