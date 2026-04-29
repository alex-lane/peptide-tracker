import { z } from 'zod';
import { isValidTimeZone } from '../scheduling/timezone.js';

// ─── Branded ID + ISO timestamp helpers ───────────────────────────────

const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const isoDateTime = z
  .string()
  .regex(ISO_DATETIME_REGEX, 'Must be ISO-8601 datetime with offset (e.g. 2026-04-29T10:00:00Z)');

export const isoDate = z.string().regex(ISO_DATE_REGEX, 'Must be ISO-8601 date (YYYY-MM-DD)');

/** UUID v4 / v7 — accept both. */
export const id = z.string().uuid();

/** IANA timezone name validated against the host's Intl.DateTimeFormat
 * implementation. This catches both shape (UTC, Area/City) and existence
 * (rejects "Bogus_TZ_Name") at parse time. */
export const ianaTimeZone = z
  .string()
  .min(1)
  .refine(isValidTimeZone, { message: 'Must be a recognized IANA timezone' });

// ─── Base entity (every row has these) ────────────────────────────────

export const baseEntity = z.object({
  id,
  householdId: id,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  /** Authoritative version for OCC. Server increments on accept. */
  version: z.number().int().nonnegative(),
  /** Soft-delete tombstone. Present means deleted. */
  deletedAt: isoDateTime.optional(),
});

export type BaseEntity = z.infer<typeof baseEntity>;
