import { Component, type ErrorInfo, type ReactNode } from 'react';
import { exportToJson, getDb } from '@/db';

interface Props {
  children: ReactNode;
  /** Optional name for the page/route that errored — surfaced to the user. */
  scope?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Last-resort fallback for React render errors. Without this, an exception
 * in any page component white-screens the whole app and the user can't even
 * reach Settings → Export to recover their data.
 *
 * Recovery affordances:
 *   - "Reload" — the most common Heisenbug fix.
 *   - "Export local data" — even if the page is broken, the user can save
 *     their data before clearing cache or reinstalling.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.scope ?? 'unknown', error, info);
    this.setState({ info });
  }

  override render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="space-y-4 p-4">
        <header className="space-y-1">
          <h1 className="text-xl">Something went wrong</h1>
          <p className="text-sm text-ink-100">
            {this.props.scope
              ? `The "${this.props.scope}" page hit an error.`
              : 'A page in the app hit an error.'}{' '}
            Other tabs in the bottom nav still work — switch to one to keep using the app, or
            export your data below before reloading.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-ink-300 px-3 py-2 text-sm text-paper-100 hover:bg-ink-200"
          >
            Reload page
          </button>
          <button
            type="button"
            onClick={() => void emergencyExport()}
            className="rounded-md border border-paper-300 px-3 py-2 text-sm text-ink-200 hover:bg-paper-200"
          >
            Export local data
          </button>
        </div>

        <details className="rounded-md border border-paper-300 bg-paper-50 p-3 text-xs">
          <summary className="cursor-pointer text-ink-100">Error details</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-ink-200">
            {error.message}
            {info?.componentStack ? `\n\nComponent stack:${info.componentStack}` : ''}
          </pre>
        </details>
      </section>
    );
  }
}

async function emergencyExport(): Promise<void> {
  try {
    const json = await exportToJson(getDb());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `peptide-tracker-emergency-${new Date().toISOString().slice(0, 10)}.export.v1.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    // eslint-disable-next-line no-alert
    window.alert(
      `Emergency export failed: ${err instanceof Error ? err.message : String(err)}.\nYour data is still in browser storage — try DevTools → Application → IndexedDB.`,
    );
  }
}
