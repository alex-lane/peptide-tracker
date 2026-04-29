import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { Disclaimer } from './Disclaimer';

export function AppLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <main className="flex-1 pb-32 pt-2 px-4 mx-auto w-full max-w-screen-md">
        <Outlet />
      </main>
      <Disclaimer />
      <BottomNav />
    </div>
  );
}
