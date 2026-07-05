"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Panel } from "@/components/ui/Panel";
import type { Checklist, ChecklistProgress } from "@/types/checklist";
import type { PublicUser } from "@/types/auth";
import { formatDueTime } from "@/lib/checklists/formatDueTime";

type TaskDraft = { title: string; dueTime: string };

export function ChecklistsAdminContent() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [tasks, setTasks] = useState<TaskDraft[]>([{ title: "", dueTime: "" }]);

  const [progressChecklistId, setProgressChecklistId] = useState<string | null>(null);
  const [progressDate, setProgressDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [progress, setProgress] = useState<ChecklistProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, userList] = await Promise.all([
        api.checklists.adminAll(),
        api.users.list(),
      ]);
      setChecklists(list);
      setUsers(userList.filter((u) => u.isActive));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load checklists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadProgress = useCallback(async () => {
    if (!progressChecklistId) return;
    setProgressLoading(true);
    setError("");
    try {
      setProgress(
        await api.checklists.progress(progressChecklistId, progressDate)
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load progress");
      setProgress(null);
    } finally {
      setProgressLoading(false);
    }
  }, [progressChecklistId, progressDate]);

  useEffect(() => {
    if (progressChecklistId) void loadProgress();
  }, [progressChecklistId, loadProgress]);

  function toggleUser(userId: string) {
    setAssignedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function addTaskRow() {
    setTasks((prev) => [...prev, { title: "", dueTime: "" }]);
  }

  function updateTask(index: number, patch: Partial<TaskDraft>) {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function removeTask(index: number) {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const cleanTasks = tasks
        .map((t) => ({
          title: t.title.trim(),
          dueTime: t.dueTime || undefined,
        }))
        .filter((t) => t.title);
      if (!title.trim()) throw new Error("Checklist title is required");
      if (assignedUserIds.length === 0) throw new Error("Select at least one user");
      if (cleanTasks.length === 0) throw new Error("Add at least one task");

      await api.checklists.create({
        title: title.trim(),
        description: description.trim() || undefined,
        assignedUserIds,
        tasks: cleanTasks,
      });

      setSuccess("Checklist created and assigned.");
      setTitle("");
      setDescription("");
      setAssignedUserIds([]);
      setTasks([{ title: "", dueTime: "" }]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to create checklist");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateChecklist(id: string) {
    if (!confirm("Deactivate this checklist? Users will no longer see it.")) return;
    setError("");
    try {
      await api.checklists.update(id, { isActive: false });
      setSuccess("Checklist deactivated.");
      if (progressChecklistId === id) {
        setProgressChecklistId(null);
        setProgress(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to deactivate checklist");
    }
  }

  const staffUsers = users.filter((u) => u.role !== "ADMIN");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">Daily checklists</h1>
        <p className="mt-2 text-base text-stone-500">
          Create daily tasks for warehouse staff. Completions appear in the activity log.
        </p>
      </div>

      <Alert message={error} />
      <Alert message={success} type="success" />

      <Panel title="Create new checklist" description="Assign tasks to one or more users">
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-5">
          <div>
            <label className="block text-base font-semibold text-stone-700">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="form-input mt-2"
              placeholder="Morning warehouse duties"
            />
          </div>
          <div>
            <label className="block text-base font-semibold text-stone-700">
              Description (optional)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="form-input mt-2"
              placeholder="Tasks to finish before opening"
            />
          </div>

          <div>
            <label className="block text-base font-semibold text-stone-700">
              Assign to users
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {staffUsers.map((u) => (
                <label
                  key={u.id}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 ${
                    assignedUserIds.includes(u.id)
                      ? "border-orange-400 bg-orange-50"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={assignedUserIds.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                    className="h-5 w-5 rounded"
                  />
                  <span className="text-sm font-semibold text-stone-800">
                    {u.name}
                    {u.warehouse?.name ? (
                      <span className="block text-xs font-normal text-stone-500">
                        {u.warehouse.name}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-base font-semibold text-stone-700">Tasks</label>
            <p className="mt-1 text-sm text-stone-500">
              Set an optional deadline per task. Workers can still complete after the time.
            </p>
            <div className="mt-3 space-y-3">
              {tasks.map((task, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50/50 p-3 sm:flex-row sm:items-end"
                >
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-stone-500">
                      Task {index + 1}
                    </label>
                    <input
                      value={task.title}
                      onChange={(e) => updateTask(index, { title: e.target.value })}
                      className="form-input mt-1"
                      placeholder={`Task ${index + 1}`}
                    />
                  </div>
                  <div className="sm:w-40">
                    <label className="text-xs font-semibold text-stone-500">
                      Complete before
                    </label>
                    <input
                      type="time"
                      value={task.dueTime}
                      onChange={(e) => updateTask(index, { dueTime: e.target.value })}
                      className="form-date mt-1 w-full"
                    />
                  </div>
                  {tasks.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeTask(index)}
                      className="sm:mb-0.5"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" className="mt-3" onClick={addTaskRow}>
              + Add task
            </Button>
          </div>

          <Button type="submit" size="lg" loading={saving}>
            Create checklist
          </Button>
        </form>
      </Panel>

      <Panel title="Existing checklists" description="View progress or deactivate">
        {loading ? (
          <LoadingSpinner label="Loading…" />
        ) : checklists.length === 0 ? (
          <p className="text-stone-500">No checklists yet.</p>
        ) : (
          <ul className="space-y-3">
            {checklists.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-stone-900">
                    {c.title}
                    {!c.isActive && (
                      <span className="ml-2 text-xs font-medium text-red-600">
                        (inactive)
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-stone-500">
                    {c.tasks.length} tasks · {c.assignedUserIds.length} users
                    {c.tasks.some((t) => t.dueTime)
                      ? ` · ${c.tasks.filter((t) => t.dueTime).length} with deadlines`
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {c.isActive && (
                    <Button
                      variant="secondary"
                      onClick={() => setProgressChecklistId(c.id)}
                    >
                      View progress
                    </Button>
                  )}
                  {c.isActive && (
                    <Button variant="ghost" onClick={() => void deactivateChecklist(c.id)}>
                      Deactivate
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {progressChecklistId && (
        <Panel
          title={`Progress — ${progress?.checklist.title ?? "Checklist"}`}
          action={
            <Button variant="ghost" onClick={() => setProgressChecklistId(null)}>
              Close
            </Button>
          }
        >
          <div className="mb-4">
            <label className="block text-sm font-semibold text-stone-700">Date</label>
            <input
              type="date"
              value={progressDate}
              onChange={(e) => setProgressDate(e.target.value)}
              className="form-input mt-1 max-w-xs"
            />
          </div>

          {progressLoading ? (
            <LoadingSpinner label="Loading progress…" />
          ) : progress ? (
            <div className="space-y-4">
              {progress.users.map((u) => (
                <div
                  key={u.id}
                  className={`rounded-xl border p-4 ${
                    u.status === "completed"
                      ? "border-green-200 bg-green-50/50"
                      : u.status === "overdue"
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-stone-200 bg-stone-50/50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-stone-900">{u.name}</p>
                      <p className="text-sm text-stone-500">
                        {u.email}
                        {u.warehouse ? ` · ${u.warehouse.name}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                          u.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : u.status === "overdue"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-stone-200 text-stone-700"
                        }`}
                      >
                        {u.status === "completed"
                          ? "Done"
                          : u.status === "overdue"
                            ? "Overdue"
                            : "Pending"}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-stone-800 ring-1 ring-stone-200">
                        {u.completedCount}/{u.totalCount}
                      </span>
                    </div>
                  </div>

                  {u.completedTasks.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-green-800">
                        Completed
                      </p>
                      <ul className="mt-1 space-y-1 text-sm text-green-800">
                        {u.completedTasks.map((t) => (
                          <li key={t.title}>
                            ✓ {t.title}
                            {t.dueTime && (
                              <span className="ml-1 text-xs text-green-700">
                                (due {formatDueTime(t.dueTime)})
                              </span>
                            )}
                            {t.completedAt && (
                              <span className="ml-1 text-xs text-green-700">
                                at{" "}
                                {new Date(t.completedAt).toLocaleTimeString("en-IN", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </span>
                            )}
                            {t.completedLate && (
                              <span className="ml-1 text-xs font-semibold text-amber-700">
                                · after deadline
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {u.pendingTasks.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-stone-600">
                        Pending
                      </p>
                      <ul className="mt-1 space-y-1 text-sm text-stone-600">
                        {u.pendingTasks.map((t) => (
                          <li
                            key={t.title}
                            className={t.isPastDue ? "font-semibold text-amber-800" : ""}
                          >
                            ○ {t.title}
                            {t.dueTime && (
                              <span
                                className={`ml-1 text-xs ${
                                  t.isPastDue ? "text-amber-700" : "text-stone-500"
                                }`}
                              >
                                · due {formatDueTime(t.dueTime)}
                                {t.isPastDue ? " (overdue)" : ""}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
