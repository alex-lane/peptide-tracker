import { Link, NavLink } from 'react-router-dom';
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
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-bg-base/90 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <div className="relative mx-auto w-full max-w-screen-md grid grid-cols-5 items-end h-16">
        {LEFT_ITEMS.map((item) => (
          <NavTab key={item.to} {...item} />
        ))}

        {/* Center-docked LOG button — primary CTA. Routes to /today with a
            param that opens the manual log modal. */}
        <div className="flex justify-center">
          <Link
            to="/today?log=manual"
            aria-label="Log a dose"
            className="-translate-y-1 h-14 w-14 rounded-full bg-accent-primary text-white flex items-center justify-center shadow-glow transition-transform duration-120 ease-out-fast active:scale-95 hover:bg-accent-primary-hover"
          >
            <Plus className="h-6 w-6" aria-hidden strokeWidth={2.5} />
            <span className="sr-only">Log a dose</span>
          </Link>
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
          isActive
            ? 'text-accent-primary'
            : 'text-text-muted hover:text-text-secondary',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className="h-5 w-5"
            aria-hidden
            strokeWidth={isActive ? 2.5 : 1.75}
            {...(isActive ? { fill: 'currentColor', fillOpacity: 0.15 } : {})}
          />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}
