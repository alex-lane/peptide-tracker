import { useState } from 'react';
import { getDb } from '@/db';
import { createInitialHousehold } from './active-household';

const PRESET_COLORS = ['#1C1A17', '#2E5E3E', '#B26A00', '#9B2C2C', '#5C5851'];

interface Props {
  onCreated?: () => void;
}

/**
 * First-run form: creates a household + the user filling out the form,
 * marks them both as the active context. Replaces the M2 console-snippet
 * workaround.
 */
export function HouseholdBootstrap({ onCreated }: Props) {
  const [householdName, setHouseholdName] = useState('Lane');
  const [userName, setUserName] = useState('Alex');
  const [color, setColor] = useState(PRESET_COLORS[0]!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!householdName.trim() || !userName.trim()) {
      setError('Both fields are required.');
      return;
    }
    setBusy(true);
    try {
      await createInitialHousehold(getDb(), {
        householdName: householdName.trim(),
        userDisplayName: userName.trim(),
        userColor: color,
      });
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-paper-300 p-4">
      <header className="space-y-1">
        <h2 className="text-lg">Create your household</h2>
        <p className="text-sm text-ink-100">
          A household holds shared inventory; each user inside gets their own logs and protocols.
          You can add a partner later from Settings.
        </p>
      </header>
      <label className="block text-sm">
        <span className="block font-medium">Household name</span>
        <input
          required
          value={householdName}
          onChange={(e) => setHouseholdName(e.target.value)}
          maxLength={120}
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="block font-medium">Your display name</span>
        <input
          required
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          maxLength={80}
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
        />
      </label>
      <fieldset className="text-sm">
        <legend className="block font-medium">Your color</legend>
        <div className="mt-2 flex gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-ink-300' : 'border-paper-300'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="touch-lg w-full rounded-md bg-ink-300 px-4 py-3 text-paper-100 transition-colors duration-120 hover:bg-ink-200 disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create household'}
      </button>
    </form>
  );
}
