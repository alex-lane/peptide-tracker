// Client-side share-scope filter — the mirror of withTenant's
// `WHERE creator_user_id = ? OR share_scope = 'household'` predicate
// on the Worker. The server enforces this on /sync/pull, but the web
// also needs to enforce it locally because IndexedDB holds rows for
// every member who has logged into this browser session (the dev-mode
// user-switcher puts both members in the same store). Without this
// filter, switching users on a single device leaks private items
// between members.
//
// Rows missing the new fields (legacy data from before A0.1) are
// treated as `shareScope: 'household'` so they remain visible — the
// 0003 backfill on the server applies the same rule. New writes from
// A0.3 always carry both fields.

export interface ShareScopeRow {
  creatorUserId?: string | undefined;
  shareScope?: 'private' | 'household' | undefined;
}

/**
 * Returns true if the given row should be visible to `viewerUserId`.
 * Visible when shared with the household, or when the viewer created
 * it. Returns true for rows without the new fields (legacy compat).
 */
export function isVisibleTo(row: ShareScopeRow, viewerUserId: string | null): boolean {
  if (!row.shareScope) return true; // legacy row, treat as household
  if (row.shareScope === 'household') return true;
  // Private — only the creator sees it. If we don't know who's viewing,
  // hide private items conservatively.
  if (!viewerUserId) return false;
  return row.creatorUserId === viewerUserId;
}

/** Convenience: filter an array. */
export function filterByShareScope<T extends ShareScopeRow>(
  rows: T[],
  viewerUserId: string | null,
): T[] {
  return rows.filter((r) => isVisibleTo(r, viewerUserId));
}
