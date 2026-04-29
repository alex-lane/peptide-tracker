import { NavLink } from 'react-router-dom';
import { Home, Box, ListOrdered, MoreHorizontal, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

const LEFT_ITEMS: NavItem[] = [
  { to: '/today', label: 'Today', icon: Home },
  { to: '/inventory', label: 'Inventory', icon: Box },
];

const RIGHT_ITEMS: NavItem[] = [
  { to: '/protocols', label: 'Protocols', icon: ListOrdered },
  { to: '/more', label: 'More', icon: MoreHorizontal },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-paper-300 bg-paper-100/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <div className="relative mx-auto w-full max-w-screen-md grid grid-cols-5 items-end h-16">
        {LEFT_ITEMS.map((item) => (
          <NavTab key={item.to} {...item} />
        ))}

        {/* Center-docked LOG button (TD2) */}
        <div className="flex justify-center">
          <button
            type="button"
            aria-label="Log a dose"
            className="-translate-y-3 h-16 w-16 rounded-full bg-ink-300 text-paper-100 flex items-center justify-center font-display text-sm transition-transform duration-120 ease-out-fast active:scale-95"
          >
            <Plus className="h-6 w-6" aria-hidden />
            <span className="sr-only">Log a dose</span>
          </button>
        </div>

        {RIGHT_ITEMS.map((item) => (
          <NavTab key={item.to} {...item} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({ to, label, icon: Icon }: NavItem) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-full flex-col items-center justify-center gap-1 text-xs transition-colors duration-120',
          isActive ? 'text-ink-300' : 'text-ink-50',
        )
      }
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span>{label}</span>
    </NavLink>
  );
}
