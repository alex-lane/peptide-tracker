// Provide an in-memory IndexedDB implementation for vitest.
// jsdom does NOT ship IndexedDB; fake-indexeddb installs a polyfill on
// globalThis at import time.
import 'fake-indexeddb/auto';

// crypto.subtle is needed for SHA-256 in the JSON export module. Node 20+
// exposes it via the webcrypto namespace; jsdom inherits global `crypto`
// from Node, but in some setups crypto.subtle is missing.
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { webcrypto } = require('node:crypto') as typeof import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    enumerable: true,
    get: () => webcrypto,
  });
}
