export function Disclaimer() {
  return (
    <footer
      role="contentinfo"
      aria-label="Disclaimer"
      className="fixed inset-x-0 bottom-16 z-10 border-t border-paper-300 bg-paper-100/95 px-4 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
    >
      <p className="mx-auto w-full max-w-screen-md text-[11px] leading-tight text-ink-100">
        Tracking and calculation only &mdash; not medical advice. The user is responsible for their
        own protocol.
      </p>
    </footer>
  );
}
