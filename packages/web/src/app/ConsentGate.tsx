import { useEffect, useState, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, IconBadge } from '@/components/ui';

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
          <IconBadge tone="primary" size="md">
            <ShieldCheck className="h-5 w-5" />
          </IconBadge>
          <h1 className="text-xl">Welcome to Peptide Tracker</h1>
          <p className="text-sm text-text-secondary">
            A private dose &amp; inventory companion. Calculator-grade math, polished UX, zero
            medical claims.
          </p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed text-text-primary">
          <p>
            <strong>This app does not give medical advice.</strong> It tracks, calculates, and
            reminds. It never recommends a dose. You enter your own protocol; you are responsible
            for your own choices.
          </p>
          <p className="text-text-secondary">
            Consult a qualified medical professional. Pay attention to units (mcg vs mg), expiry
            dates, sterility, and your own response.
          </p>
        </section>

        <Button
          variant="primary"
          size="lg"
          className="w-full touch-lg"
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
        </Button>

        <p className="text-xs text-text-muted">
          Version 0.0.0 &middot; Tracking only, not medical advice.
        </p>
      </main>
    </div>
  );
}
