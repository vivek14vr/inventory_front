"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Panel } from "@/components/ui/Panel";
import type { ChecklistReminderSettings } from "@/types/settings";

const PRESET_OFFSETS = [60, 30, 15, 10, 5, 1] as const;

function labelForMinutes(mins: number): string {
  if (mins === 60) return "1 hour before";
  if (mins === 1) return "1 minute before";
  return `${mins} minutes before`;
}

/** Automatic due-time reminder settings (create-checklist tab). */
export function ChecklistReminderSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [settings, setSettings] = useState<ChecklistReminderSettings | null>(
    null
  );
  const [customMinutes, setCustomMinutes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSettings(await api.settings.checklistReminders.get());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not load notification settings"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleOffset(mins: number) {
    if (!settings) return;
    const has = settings.beforeOffsetsMin.includes(mins);
    const next = has
      ? settings.beforeOffsetsMin.filter((m) => m !== mins)
      : [...settings.beforeOffsetsMin, mins];
    setSettings({ ...settings, beforeOffsetsMin: next });
    setSuccess("");
  }

  function addCustomOffset() {
    if (!settings) return;
    const mins = Number.parseInt(customMinutes, 10);
    if (!Number.isInteger(mins) || mins < 1 || mins > 24 * 60) {
      setError("Enter minutes between 1 and 1440");
      return;
    }
    if (settings.beforeOffsetsMin.includes(mins)) {
      setError("That reminder time is already selected");
      return;
    }
    setError("");
    setSettings({
      ...settings,
      beforeOffsetsMin: [...settings.beforeOffsetsMin, mins],
    });
    setCustomMinutes("");
    setSuccess("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    if (settings.beforeOffsetsMin.length === 0) {
      setError("Select at least one reminder time before due");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const saved = await api.settings.checklistReminders.update(settings);
      setSettings(saved);
      setSuccess("Automatic reminder settings saved");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save settings"
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedSet = new Set(settings?.beforeOffsetsMin ?? []);
  const extraOffsets = (settings?.beforeOffsetsMin ?? [])
    .filter((m) => !(PRESET_OFFSETS as readonly number[]).includes(m))
    .sort((a, b) => b - a);

  return (
    <Panel
      title="Automatic checklist reminders"
      description="Schedule how often due-time reminders are created for assigned tasks."
    >
      {loading || !settings ? (
        <LoadingSpinner label="Loading settings…" />
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
          <Alert message={error} />
          <Alert message={success} type="success" />

          <div className="space-y-3">
            <label className="flex min-h-14 cursor-pointer items-start gap-4 rounded-2xl border-2 border-stone-200 bg-white px-5 py-4">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) =>
                  setSettings({ ...settings, enabled: e.target.checked })
                }
                className="mt-1 h-5 w-5 rounded"
              />
              <span>
                <span className="block text-base font-bold text-stone-900">
                  Automatic reminders
                </span>
                <span className="mt-0.5 block text-sm text-stone-500">
                  When off, checklist due-time reminders stop. Manual send
                  above still works.
                </span>
              </span>
            </label>

            <label
              className={`flex min-h-14 cursor-pointer items-start gap-4 rounded-2xl border-2 px-5 py-4 ${
                settings.enabled
                  ? "border-stone-200 bg-white"
                  : "border-stone-100 bg-stone-50 opacity-60"
              }`}
            >
              <input
                type="checkbox"
                checked={settings.pendingEnabled}
                disabled={!settings.enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    pendingEnabled: e.target.checked,
                  })
                }
                className="mt-1 h-5 w-5 rounded"
              />
              <span>
                <span className="block text-base font-bold text-stone-900">
                  “Task pending” alert
                </span>
                <span className="mt-0.5 block text-sm text-stone-500">
                  One base alert when a task is still open for the day.
                </span>
              </span>
            </label>
          </div>

          <fieldset disabled={!settings.enabled} className="space-y-3">
            <legend className="text-base font-bold text-stone-900">
              Reminder frequency (before due)
            </legend>
            <p className="text-sm text-stone-500">
              Only the tightest matching time fires (e.g. 8 minutes left uses
              “10 minutes before”, not every earlier slot).
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_OFFSETS.map((mins) => {
                const on = selectedSet.has(mins);
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => toggleOffset(mins)}
                    className={`rounded-full border-2 px-4 py-2 text-sm font-semibold transition ${
                      on
                        ? "border-orange-600 bg-orange-600 text-white"
                        : "border-stone-200 bg-white text-stone-700 hover:border-orange-300"
                    }`}
                  >
                    {labelForMinutes(mins)}
                  </button>
                );
              })}
              {extraOffsets.map((mins) => {
                const on = selectedSet.has(mins);
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => toggleOffset(mins)}
                    className={`rounded-full border-2 px-4 py-2 text-sm font-semibold transition ${
                      on
                        ? "border-orange-600 bg-orange-600 text-white"
                        : "border-stone-200 bg-white text-stone-700"
                    }`}
                  >
                    {labelForMinutes(mins)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-xs font-semibold text-stone-500">
                  Custom minutes
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  className="form-input mt-1 w-28"
                  placeholder="e.g. 45"
                />
              </div>
              <Button type="button" variant="outline" onClick={addCustomOffset}>
                Add
              </Button>
            </div>
          </fieldset>

          <div
            className={settings.enabled ? "" : "pointer-events-none opacity-60"}
          >
            <label className="block text-base font-bold text-stone-900">
              Overdue reminder interval
            </label>
            <p className="mt-1 text-sm text-stone-500">
              After the due time, remind again every N minutes.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={240}
                disabled={!settings.enabled}
                value={settings.afterIntervalMin}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    afterIntervalMin: Number(e.target.value) || 10,
                  })
                }
                className="form-input w-28"
              />
              <span className="text-sm text-stone-600">minutes</span>
            </div>
          </div>

          <Button type="submit" size="lg" loading={saving}>
            Save automatic settings
          </Button>
        </form>
      )}
    </Panel>
  );
}
