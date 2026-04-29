import { useEffect, useState, type ReactNode } from 'react';

const CONSENT_KEY = 'peptide-tracker:consent-v1';

interface ConsentGateProps {
  children: ReactNode;
}

export function ConsentGate({ children }: ConsentGateProps) {
  const [consented, setConsented] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setConsented(localStorage.getItem(CONSENT_KEY) === '1');
    } catch {
      setConsented(false);
    }
  }, []);

  if (consented === null) return null;
  if (consented) return <>{children}</>;

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-8">
      <main className="w-full max-w-md space-y-6">
        <header className="space-y-3">
          <h1 className="text-xl">Welcome to Peptide Tracker</h1>
          <p className="text-sm text-ink-100">
            A private dose &amp; inventory companion. Calculator-grade math, polished UX, zero
            medical claims.
          </p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed">
          <p>
            <strong>This app does not give medical advice.</strong> It tracks, calculates, and
            reminds. It never recommends a dose. You enter your own protocol; you are responsible
            for your own choices.
          </p>
          <p>
            Consult a qualified medical professional. Pay attention to units (mcg vs mg), expiry
            dates, sterility, and your own response.
          </p>
        </section>

        <button
          type="button"
          className="w-full touch-lg bg-ink-300 text-paper-100 px-4 py-3 rounded-md transition-colors duration-120 ease-out-fast hover:bg-ink-200"
          onClick={() => {
            try {
              localStorage.setItem(CONSENT_KEY, '1');
            } catch {
              // ignore — gate stays up
            }
            setConsented(true);
          }}
        >
          I understand &mdash; continue
        </button>

        <p className="text-xs text-ink-100">
          Version 0.0.0 &middot; Tracking only, not medical advice.
        </p>
      </main>
    </div>
  );
}
