export function TopBar() {
  return (
    <header className="sticky top-0 z-10 bg-paper-100/95 backdrop-blur border-b border-paper-300">
      <div className="mx-auto w-full max-w-screen-md flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-base">Peptide Tracker</span>
          <span className="text-xs text-ink-100">household</span>
        </div>
        <button
          type="button"
          aria-label="Switch user"
          className="text-xs px-3 py-1.5 rounded-full bg-paper-200 text-ink-200 hover:bg-paper-300 transition-colors duration-120"
        >
          Alex
        </button>
      </div>
    </header>
  );
}
