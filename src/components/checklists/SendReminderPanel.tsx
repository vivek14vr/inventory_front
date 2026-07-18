"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Panel } from "@/components/ui/Panel";
import type { PublicUser } from "@/types/auth";

export function SendReminderPanel() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [sendUserId, setSendUserId] = useState("");
  const [sendTitle, setSendTitle] = useState("Reminder");
  const [sendMessage, setSendMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const userList = await api.users.list();
      setUsers(userList.filter((u) => u.isActive && u.role !== "ADMIN"));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load users"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSendReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!sendUserId) {
      setError("Select a user to remind");
      return;
    }
    if (!sendMessage.trim()) {
      setError("Enter a reminder message");
      return;
    }
    setSending(true);
    setError("");
    setSuccess("");
    try {
      const target = users.find((u) => u.id === sendUserId);
      await api.notifications.send({
        userId: sendUserId,
        title: sendTitle.trim() || "Reminder",
        message: sendMessage.trim(),
      });
      setSuccess(
        target
          ? `Reminder sent to ${target.name}. They’ll see a toast on their next refresh.`
          : "Reminder sent."
      );
      setSendMessage("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not send reminder"
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Panel
      title="Send a reminder"
      description="Push a toast notification to a specific user right now."
    >
      {loading ? (
        <LoadingSpinner label="Loading…" />
      ) : (
        <form
          onSubmit={(e) => void handleSendReminder(e)}
          className="space-y-4"
        >
          <Alert message={error} />
          <Alert message={success} type="success" />

          <div>
            <label className="block text-base font-semibold text-stone-700">
              User
            </label>
            <select
              value={sendUserId}
              onChange={(e) => setSendUserId(e.target.value)}
              className="form-select mt-2"
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.warehouse?.name ? ` · ${u.warehouse.name}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-base font-semibold text-stone-700">
              Title
            </label>
            <input
              value={sendTitle}
              onChange={(e) => setSendTitle(e.target.value)}
              className="form-input mt-2"
              placeholder="Reminder"
            />
          </div>

          <div>
            <label className="block text-base font-semibold text-stone-700">
              Message
            </label>
            <textarea
              value={sendMessage}
              onChange={(e) => setSendMessage(e.target.value)}
              className="form-input mt-2 min-h-24"
              placeholder="Please finish today’s Restock task."
            />
          </div>

          <Button type="submit" size="lg" loading={sending}>
            Send notification
          </Button>
        </form>
      )}
    </Panel>
  );
}
