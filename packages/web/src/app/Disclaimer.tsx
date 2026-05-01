import { Info } from 'lucide-react';

export function Disclaimer() {
  return (
    <footer
      role="contentinfo"
      aria-label="Disclaimer"
      className="fixed inset-x-0 bottom-16 z-10 border-t border-border-subtle bg-bg-base/95 backdrop-blur pb-1 pt-1.5"
    >
      <p className="mx-auto flex w-full max-w-screen-md items-center justify-center gap-1.5 px-12 text-center text-[11px] leading-tight text-text-muted">
        <Info className="h-3 w-3 flex-shrink-0" aria-hidden />
        Tracking and calculation only &mdash; not medical advice.
      </p>
    </footer>
  );
}
