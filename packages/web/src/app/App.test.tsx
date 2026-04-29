import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

describe('App scaffold', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the consent gate on first run', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Welcome to Peptide Tracker/i })).toBeTruthy();
  });

  it('renders the layout once consent is granted', () => {
    localStorage.setItem('peptide-tracker:consent-v1', '1');
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Today/i })).toBeTruthy();
    expect(screen.getByRole('contentinfo', { name: /Disclaimer/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Log a dose/i })).toBeTruthy();
  });

  it('records consent and dismisses the gate', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /I understand/i }));
    expect(localStorage.getItem('peptide-tracker:consent-v1')).toBe('1');
  });
});
