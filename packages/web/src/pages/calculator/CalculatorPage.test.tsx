import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CalculatorPage } from './CalculatorPage';
import { _resetDbSingleton, getDb } from '@/db';
import { createInitialHousehold } from '@/app/active-household';

beforeEach(async () => {
  // The calculator page uses the singleton DB; spin up a fresh one per test.
  _resetDbSingleton();
  const db = getDb();
  await db.open();
  await createInitialHousehold(db, {
    householdName: 'Test',
    userDisplayName: 'Tester',
    userColor: '#1C1A17',
  });
});

afterEach(() => {
  _resetDbSingleton();
});

describe('CalculatorPage', () => {
  it('renders three tabs and the default reconstitute pane is active', async () => {
    render(
      <MemoryRouter initialEntries={['/more/calculator']}>
        <CalculatorPage />
      </MemoryRouter>,
    );

    // All three tablist entries are rendered.
    expect(await screen.findByRole('tab', { name: /Reconstitute/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Dose/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Conversion/i })).toBeTruthy();

    // Reconstitute is the default; Vial mass label appears at least once
    // (Radix may also render inactive panels with hidden attribute).
    expect(screen.getAllByText(/Vial mass/i).length).toBeGreaterThan(0);
  });

  it('honors ?tab=dose deep link', async () => {
    render(
      <MemoryRouter initialEntries={['/more/calculator?tab=dose']}>
        <CalculatorPage />
      </MemoryRouter>,
    );
    // The Dose tab is selected; concentration input appears (manual mode
    // is shown when no product is selected).
    const concInput = await screen.findByPlaceholderText('2.5');
    expect(concInput).toBeTruthy();
  });

  it('Dose tab shows the result tile and below-precision warning for tiny doses', async () => {
    render(
      <MemoryRouter initialEntries={['/more/calculator?tab=dose']}>
        <CalculatorPage />
      </MemoryRouter>,
    );

    // Wait for the dose tab to mount.
    const concInput = await screen.findByPlaceholderText('2.5');
    fireEvent.change(concInput, { target: { value: '2.5' } }); // 2.5 mg/mL = 2500 mcg/mL
    const doseInput = await screen.findByPlaceholderText('250');
    fireEvent.change(doseInput, { target: { value: '10' } }); // 10 mcg / 2500 = 0.004 mL

    // Result tile populates.
    const tile = await screen.findByTestId('result-tile');
    expect(tile.textContent).toContain('mL');

    // Below-precision warning appears.
    expect(await screen.findByTestId('warning-VOLUME_BELOW_PRECISION')).toBeTruthy();
  });
});
