// Thin per-aggregate repos. Most aggregates only need the base CRUD; the
// non-trivial logic lives in DoseLogRepo (atomic ledger) below.

import type {
  CalendarEventMapping,
  CalendarFeedSettings,
  CustomMetric,
  DoseSchedule,
  EducationContent,
  Household,
  InventoryBatch,
  InventoryItem,
  Protocol,
  ProtocolItem,
  SupplyItem,
  UserProfile,
} from '../types.js';
import type { PeptideDb } from '../schema.js';
import { Repo } from './base.js';

export class HouseholdRepo extends Repo<Household> {
  constructor(db: PeptideDb) {
    super(db, db.households, 'household');
  }
}

export class UserProfileRepo extends Repo<UserProfile> {
  constructor(db: PeptideDb) {
    super(db, db.userProfiles, 'userProfile');
  }
}

export class InventoryItemRepo extends Repo<InventoryItem> {
  constructor(db: PeptideDb) {
    super(db, db.inventoryItems, 'inventoryItem');
  }
}

export class InventoryBatchRepo extends Repo<InventoryBatch> {
  constructor(db: PeptideDb) {
    super(db, db.inventoryBatches, 'inventoryBatch');
  }

  async listForItem(householdId: string, itemId: string): Promise<InventoryBatch[]> {
    const rows = await this.db.inventoryBatches
      .where('[householdId+itemId]')
      .equals([householdId, itemId])
      .toArray();
    return rows.filter((r) => !r.deletedAt);
  }
}

export class SupplyItemRepo extends Repo<SupplyItem> {
  constructor(db: PeptideDb) {
    super(db, db.supplyItems, 'supplyItem');
  }
}

export class ProtocolRepo extends Repo<Protocol> {
  constructor(db: PeptideDb) {
    super(db, db.protocols, 'protocol');
  }

  async listActiveForUser(householdId: string, userId: string): Promise<Protocol[]> {
    const rows = await this.db.protocols
      .where('[householdId+userId]')
      .equals([householdId, userId])
      .toArray();
    return rows.filter((r) => !r.deletedAt && r.active);
  }
}

/**
 * ProtocolItem is special — it is NOT a top-level baseEntity (no
 * householdId, no version, no soft delete). The current Zod schema treats
 * it as a child of Protocol. We store it in its own table because Dexie
 * has no FK enforcement, but we provide convenience listers keyed by
 * protocolId rather than the Repo<BaseRow> CRUD.
 */
export class ProtocolItemRepo {
  constructor(private readonly db: PeptideDb) {}

  async listForProtocol(protocolId: string): Promise<ProtocolItem[]> {
    return this.db.protocolItems.where('protocolId').equals(protocolId).toArray();
  }

  async upsert(item: ProtocolItem): Promise<void> {
    await this.db.protocolItems.put(item);
  }

  async deleteForProtocol(protocolId: string): Promise<void> {
    await this.db.protocolItems.where('protocolId').equals(protocolId).delete();
  }
}

export class DoseScheduleRepo extends Repo<DoseSchedule> {
  constructor(db: PeptideDb) {
    super(db, db.doseSchedules, 'doseSchedule');
  }

  async listPendingForUser(
    householdId: string,
    userId: string,
    fromIso: string,
    toIso: string,
  ): Promise<DoseSchedule[]> {
    const rows = await this.db.doseSchedules
      .where('[householdId+userId+scheduledFor]')
      .between([householdId, userId, fromIso], [householdId, userId, toIso], true, true)
      .toArray();
    return rows.filter((r) => !r.deletedAt && r.status === 'pending');
  }
}

export class CustomMetricRepo extends Repo<CustomMetric> {
  constructor(db: PeptideDb) {
    super(db, db.customMetrics, 'customMetric');
  }
}

/**
 * MetricLog has no soft-delete in the current Zod shape (append-only). We
 * provide a thin direct accessor instead of inheriting Repo<BaseRow>.
 */
export class MetricLogRepo {
  constructor(private readonly db: PeptideDb) {}

  async list(householdId: string, userId: string): Promise<unknown[]> {
    return this.db.metricLogs
      .where('[householdId+userId+recordedAt]')
      .between([householdId, userId, ''], [householdId, userId, '￿'], true, true)
      .toArray();
  }
}

export class CalendarFeedSettingsRepo {
  constructor(private readonly db: PeptideDb) {}

  async get(
    householdId: string,
    scope: 'household' | 'user',
    userId?: string,
  ): Promise<CalendarFeedSettings | undefined> {
    return this.db.calendarFeedSettings
      .where('[householdId+scope+userId]')
      .equals([householdId, scope, userId ?? ''])
      .first();
  }

  async upsert(row: CalendarFeedSettings): Promise<void> {
    await this.db.calendarFeedSettings.put(row);
  }
}

export class CalendarEventMappingRepo {
  constructor(private readonly db: PeptideDb) {}

  async getForSchedule(scheduleId: string): Promise<CalendarEventMapping | undefined> {
    return this.db.calendarEventMappings.where('scheduleId').equals(scheduleId).first();
  }

  async upsert(row: CalendarEventMapping): Promise<void> {
    await this.db.calendarEventMappings.put(row);
  }
}

export class EducationContentRepo {
  constructor(private readonly db: PeptideDb) {}

  async getBySlug(slug: string): Promise<EducationContent | undefined> {
    return this.db.educationContent.where('slug').equals(slug).first();
  }

  async list(householdId: string): Promise<EducationContent[]> {
    // Returns global (no householdId) + this household's content.
    const all = await this.db.educationContent.toArray();
    return all.filter((c) => !c.householdId || c.householdId === householdId);
  }

  async upsert(row: EducationContent): Promise<void> {
    await this.db.educationContent.put(row);
  }
}
