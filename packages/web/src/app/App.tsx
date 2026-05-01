import { Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AppLayout } from './AppLayout';
import { TodayPage } from '@/pages/today/TodayPage';
import { InventoryPage } from '@/pages/inventory/InventoryPage';
import { ProtocolsPage } from '@/pages/protocols/ProtocolsPage';
import { MorePage } from '@/pages/more/MorePage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { CalculatorPage } from '@/pages/calculator/CalculatorPage';
import { InsightsPage } from '@/pages/insights/InsightsPage';
import { ConsentGate } from './ConsentGate';
import { ErrorBoundary } from './ErrorBoundary';
import { useTheme } from './useTheme';

function guarded(scope: string, node: ReactNode): ReactNode {
  return <ErrorBoundary scope={scope}>{node}</ErrorBoundary>;
}

export function App() {
  // Side-effect-only hook call — applies the persisted theme to <html> on mount.
  useTheme();
  return (
    <ConsentGate>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={guarded('Today', <TodayPage />)} />
          <Route path="/inventory" element={guarded('Inventory', <InventoryPage />)} />
          <Route path="/protocols" element={guarded('Protocols', <ProtocolsPage />)} />
          <Route path="/more" element={guarded('More', <MorePage />)} />
          <Route
            path="/more/calculator"
            element={guarded('Calculator', <CalculatorPage />)}
          />
          <Route
            path="/more/insights"
            element={guarded('Insights', <InsightsPage />)}
          />
          <Route path="/settings" element={guarded('Settings', <SettingsPage />)} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </ConsentGate>
  );
}
