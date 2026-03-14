export function isReportDue(scheduleCron: string | null, lastRunAt: string | null, now = new Date()) {
  if (!scheduleCron) return false;
  const cron = scheduleCron.trim();
  if (!cron) return false;

  // Simple, deterministic support for common schedules used by UI presets.
  const mapMinutes: Record<string, number> = {
    "*/5 * * * *": 5,
    "*/10 * * * *": 10,
    "*/15 * * * *": 15,
    "*/30 * * * *": 30,
    "0 * * * *": 60,
    "0 */2 * * *": 120,
    "0 */6 * * *": 360,
    "0 0 * * *": 24 * 60,
    "0 0 * * 0": 7 * 24 * 60
  };

  const runEveryMinutes = mapMinutes[cron] ?? 24 * 60;
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt);
  if (Number.isNaN(last.getTime())) return true;
  const elapsedMinutes = (now.getTime() - last.getTime()) / 60000;
  return elapsedMinutes >= runEveryMinutes;
}

export const schedulePresets: Array<{ id: string; label: string; cron: string }> = [
  { id: "none", label: "Not scheduled", cron: "" },
  { id: "daily", label: "Daily", cron: "0 0 * * *" },
  { id: "weekly", label: "Weekly", cron: "0 0 * * 0" },
  { id: "hourly", label: "Hourly", cron: "0 * * * *" },
  { id: "every_15m", label: "Every 15 minutes", cron: "*/15 * * * *" }
];
