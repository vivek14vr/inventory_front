"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { useNotifications } from "@/contexts/NotificationContext";
import type { TodayChecklist } from "@/types/checklist";
import { formatDueTime } from "@/lib/checklists/formatDueTime";

type ChecklistsTodayContentProps = {
  notificationsHref: string;
};

function applyTaskCompletion(
  lists: TodayChecklist[],
  checklistId: string,
  taskId: string,
  completed: boolean
): TodayChecklist[] {
  return lists.map((checklist) => {
    if (checklist.id !== checklistId) return checklist;
    const tasks = checklist.tasks.map((task) => {
      if (task.id !== taskId) return task;
      return {
        ...task,
        completed,
        completedAt: completed ? new Date().toISOString() : undefined,
        isPastDue: completed ? false : task.isPastDue,
      };
    });
    const completedCount = tasks.filter((t) => t.completed).length;
    return {
      ...checklist,
      tasks,
      completedCount,
      isPastDue: tasks.some((t) => !t.completed && t.isPastDue),
    };
  });
}

export function ChecklistsTodayContent({ notificationsHref }: ChecklistsTodayContentProps) {
  const [checklists, setChecklists] = useState<TodayChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const { unreadCount } = useNotifications();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      setChecklists(await api.checklists.today());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load checklists");
      if (!silent) setChecklists([]);
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleTask(
    checklistId: string,
    taskId: string,
    completed: boolean
  ) {
    const key = `${checklistId}:${taskId}`;
    const nextCompleted = !completed;
    const previous = checklists;

    setBusyTask(key);
    setError("");
    setChecklists(applyTaskCompletion(previous, checklistId, taskId, nextCompleted));

    try {
      if (completed) {
        await api.checklists.uncomplete(checklistId, taskId);
      } else {
        await api.checklists.complete(checklistId, taskId);
      }
      await load({ silent: true });
    } catch (err) {
      setChecklists(previous);
      setError(err instanceof ApiError ? err.message : "Failed to update task");
    } finally {
      setBusyTask(null);
    }
  }

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today's checklist"
        description={today}
        actions={
          <>
            <ButtonLink
              href={notificationsHref}
              variant="secondary"
              size="lg"
              className="relative"
            >
              Notification history
              {unreadCount > 0 && (
                <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1.5 text-xs font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </ButtonLink>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => void load()}
              loading={loading || refreshing}
            >
              Refresh
            </Button>
          </>
        }
      />

      <Alert message={error} />

      {loading ? (
        <LoadingSpinner label="Loading tasks…" />
      ) : checklists.length === 0 ? (
        <Panel title="No tasks today">
          <p className="text-base text-stone-500">
            Your admin has not assigned any daily checklists yet.
          </p>
        </Panel>
      ) : (
        checklists.map((checklist) => (
          <Panel
            key={checklist.id}
            title={checklist.title}
            description={
              checklist.description ??
              `${checklist.completedCount} of ${checklist.totalCount} done`
            }
            action={
              <span
                className={`rounded-full px-3 py-1 text-sm font-bold ${
                  checklist.completedCount === checklist.totalCount
                    ? "bg-green-100 text-green-800"
                    : checklist.isPastDue
                      ? "bg-amber-100 text-amber-800"
                      : "bg-stone-100 text-stone-700"
                }`}
              >
                {checklist.completedCount}/{checklist.totalCount}
              </span>
            }
          >
            <ul className="space-y-3">
              {checklist.tasks.map((task) => {
                const busy = busyTask === `${checklist.id}:${task.id}`;
                const showPastDue = !task.completed && task.isPastDue;
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void toggleTask(checklist.id, task.id, !!task.completed)
                      }
                      className={`flex w-full min-h-14 items-center gap-4 rounded-2xl border-2 px-4 py-3 text-left transition active:scale-[0.99] ${
                        task.completed
                          ? "border-green-300 bg-green-50"
                          : showPastDue
                            ? "border-amber-300 bg-amber-50/60 hover:border-amber-400"
                            : "border-stone-200 bg-white hover:border-orange-300 hover:bg-orange-50"
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${
                          task.completed
                            ? "bg-green-600 text-white"
                            : showPastDue
                              ? "border-2 border-amber-400 bg-amber-100 text-amber-700"
                              : "border-2 border-stone-300 bg-white text-stone-400"
                        }`}
                      >
                        {task.completed ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-base font-semibold ${
                            task.completed ? "text-green-900 line-through" : "text-stone-900"
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.dueTime && !task.completed && (
                          <span
                            className={`mt-0.5 block text-sm font-medium ${
                              showPastDue ? "text-amber-800" : "text-indigo-700"
                            }`}
                          >
                            {showPastDue
                              ? `Past due · was ${formatDueTime(task.dueTime)}`
                              : `Complete before ${formatDueTime(task.dueTime)}`}
                          </span>
                        )}
                        {task.dueTime && task.completed && (
                          <span className="mt-0.5 block text-xs text-green-700">
                            Due {formatDueTime(task.dueTime)}
                          </span>
                        )}
                      </span>
                      {busy && (
                        <span className="text-sm text-stone-400">Saving…</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))
      )}
    </div>
  );
}
