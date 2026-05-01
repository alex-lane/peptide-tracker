import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { TodayPage } from '@/pages/today/TodayPage';
import { InventoryPage } from '@/pages/inventory/InventoryPage';
import { ProtocolsPage } from '@/pages/protocols/ProtocolsPage';
import { MorePage } from '@/pages/more/MorePage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { CalculatorPage } from '@/pages/calculator/CalculatorPage';
import { InsightsPage } from '@/pages/insights/InsightsPage';
import { ConsentGate } from './ConsentGate';

export function App() {
  return (
    <ConsentGate>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/protocols" element={<ProtocolsPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/more/calculator" element={<CalculatorPage />} />
          <Route path="/more/insights" element={<InsightsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </ConsentGate>
  );
}
