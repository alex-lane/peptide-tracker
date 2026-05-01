// Per-user export helpers. CSV is one row per dose log or metric log; JSON
// is the same shape exposed by the M2 export but filtered to one userId.

import type { CustomMetric, DoseLog, MetricLog, PeptideDb } from '@/db';

export interface UserExportArgs {
  db: PeptideDb;
  householdId: string;
  userId: string;
}

export async function buildUserDoseLogsCsv(args: UserExportArgs): Promise<string> {
  const rows = (
    await args.db.doseLogs
      .where('[householdId+userId+takenAt]')
      .between(
        [args.householdId, args.userId, ''],
        [args.householdId, args.userId, '￿'],
        true,
        true,
      )
      .toArray()
  ).filter((r) => !r.deletedAt);

  const inventoryItems = await args.db.inventoryItems.toArray();
  const itemNameById = new Map(inventoryItems.map((i) => [i.id, i.name]));

  const header = [
    'taken_at',
    'item_name',
    'item_id',
    'batch_id',
    'dose_amount',
    'dose_unit',
    'method',
    'injection_site',
    'schedule_id',
    'protocol_id',
    'notes',
  ];
  const lines = [header.join(',')];
  const sorted = [...rows].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  for (const r of sorted) lines.push(formatLogRow(r, itemNameById));
  return lines.join('\n') + '\n';
}

function formatLogRow(r: DoseLog, itemNameById: Map<string, string>): string {
  return [
    r.takenAt,
    csvField(itemNameById.get(r.itemId) ?? ''),
    r.itemId,
    r.batchId ?? '',
    String(r.doseAmount),
    r.doseUnit,
    r.method,
    r.injectionSite ?? '',
    r.scheduleId ?? '',
    r.protocolId ?? '',
    csvField(r.notesMd ?? ''),
  ].join(',');
}

export async function buildUserMetricLogsCsv(args: UserExportArgs): Promise<string> {
  const metrics = (
    await args.db.customMetrics.where('[householdId+userId]').equals([args.householdId, args.userId]).toArray()
  ).filter((m) => !m.deletedAt);
  const metricById = new Map(metrics.map((m) => [m.id, m]));

  const logs = (
    await args.db.metricLogs
      .where('[householdId+userId+recordedAt]')
      .between(
        [args.householdId, args.userId, ''],
        [args.householdId, args.userId, '￿'],
        true,
        true,
      )
      .toArray()
  ) as MetricLog[];

  const header = ['recorded_at', 'metric_name', 'metric_unit', 'metric_type', 'value', 'notes'];
  const lines = [header.join(',')];
  const sorted = [...logs].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  for (const l of sorted) lines.push(formatMetricRow(l, metricById));
  return lines.join('\n') + '\n';
}

function formatMetricRow(l: MetricLog, metricById: Map<string, CustomMetric>): string {
  const m = metricById.get(l.metricId);
  return [
    l.recordedAt,
    csvField(m?.name ?? ''),
    csvField(m?.unit ?? ''),
    m?.type ?? '',
    csvField(typeof l.value === 'string' ? l.value : String(l.value)),
    csvField(l.notesMd ?? ''),
  ].join(',');
}

/** RFC-4180 escape: wrap in quotes if it contains comma/quote/newline. */
function csvField(s: string): string {
  if (/[,"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface UserJsonExport {
  version: 1;
  exportedAt: string;
  householdId: string;
  userId: string;
  doseLogs: DoseLog[];
  customMetrics: CustomMetric[];
  metricLogs: MetricLog[];
}

export async function buildUserJsonExport(args: UserExportArgs): Promise<UserJsonExport> {
  const [doseLogs, customMetrics, metricLogs] = await Promise.all([
    args.db.doseLogs
      .where('[householdId+userId+takenAt]')
      .between(
        [args.householdId, args.userId, ''],
        [args.householdId, args.userId, '￿'],
        true,
        true,
      )
      .toArray()
      .then((rs) => rs.filter((r) => !r.deletedAt)),
    args.db.customMetrics
      .where('[householdId+userId]')
      .equals([args.householdId, args.userId])
      .toArray()
      .then((rs) => rs.filter((r) => !r.deletedAt)),
    args.db.metricLogs
      .where('[householdId+userId+recordedAt]')
      .between(
        [args.householdId, args.userId, ''],
        [args.householdId, args.userId, '￿'],
        true,
        true,
      )
      .toArray() as Promise<MetricLog[]>,
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    householdId: args.householdId,
    userId: args.userId,
    doseLogs,
    customMetrics,
    metricLogs,
  };
}

/** Trigger a browser download. */
export function downloadText(filename: string, body: string, mime: string): void {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
