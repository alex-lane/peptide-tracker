// peptide-tracker domain — pure TypeScript, framework-free.
// Same files run in browser AND Cloudflare Worker. No Node, no Dexie,
// no Drizzle, no DOM imports allowed in this package.

export * from './schemas/index.js';
export * from './math/index.js';
export * from './scheduling/index.js';
export * from './inventory/index.js';
export * from './ical/index.js';

export const DOMAIN_VERSION = '0.1.0';
