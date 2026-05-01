// CRUD helpers for CustomMetric + MetricLog. CustomMetric is a household
// row but per-user; MetricLog is append-only (no soft delete on the schema).

import { customMetric as customMetricSchema, metricLog as metricLogSchema } from '@peptide/domain';
import type { CustomMetric, MetricLog, PeptideDb } from '@/db';
import { CustomMetricRepo, newId, nowIso } from '@/db';

export interface CreateMetricInput {
  householdId: string;
  userId: string;
  name: string;
  unit?: string;
  type: CustomMetric['type'];
}

export async function createMetric(
  db: PeptideDb,
  input: CreateMetricInput,
): Promise<CustomMetric> {
  const now = nowIso();
  const row: CustomMetric = customMetricSchema.parse({
    id: newId(),
    householdId: input.householdId,
    userId: input.userId,
    name: input.name.trim(),
    ...(input.unit?.trim() ? { unit: input.unit.trim() } : {}),
    type: input.type,
    archived: false,
    createdAt: now,
    updatedAt: now,
    version: 0,
  });
  await new CustomMetricRepo(db).upsert(row);
  return row;
}

export async function archiveMetric(db: PeptideDb, metricId: string): Promise<void> {
  const row = await db.customMetrics.get(metricId);
  if (!row || row.deletedAt) return;
  await new CustomMetricRepo(db).upsert({ ...row, archived: true });
}

export async function unarchiveMetric(db: PeptideDb, metricId: string): Promise<void> {
  const row = await db.customMetrics.get(metricId);
  if (!row || row.deletedAt) return;
  await new CustomMetricRepo(db).upsert({ ...row, archived: false });
}

export async function logMetric(
  db: PeptideDb,
  args: {
    householdId: string;
    userId: string;
    metricId: string;
    value: MetricLog['value'];
    recordedAt?: string;
    notesMd?: string;
  },
): Promise<MetricLog> {
  const row: MetricLog = metricLogSchema.parse({
    id: newId(),
    householdId: args.householdId,
    userId: args.userId,
    metricId: args.metricId,
    value: args.value,
    recordedAt: args.recordedAt ?? nowIso(),
    ...(args.notesMd?.trim() ? { notesMd: args.notesMd.trim() } : {}),
  });
  await db.transaction('rw', db.metricLogs, db.outbox, async () => {
    await db.metricLogs.put(row);
    await db.outbox.add({
      mutationId: newId(),
      entity: 'metricLog',
      op: 'upsert',
      payload: row,
      createdAt: nowIso(),
      retryCount: 0,
      lastError: null,
      ackedAt: null,
    });
  });
  return row;
}

/** Returns a chronological series for a numeric metric. Skips non-numeric values. */
export function metricSeries(
  metric: CustomMetric,
  logs: readonly MetricLog[],
): Array<{ recordedAt: string; value: number }> {
  return logs
    .filter((l) => l.metricId === metric.id && typeof l.value === 'number')
    .map((l) => ({ recordedAt: l.recordedAt, value: l.value as number }))
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}
