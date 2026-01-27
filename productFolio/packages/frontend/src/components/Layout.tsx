import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/app.store';
import { UserMenu } from './auth';
import { useRoutePrefetch } from '../hooks/useRoutePrefetch';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

// Icons as simple SVG components
const Icons = {
  Briefcase: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" />
    </svg>
  ),
  Users: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  ),
  Layers: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3" />
    </svg>
  ),
  ChartBar: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  ),
};

const navigation = [
  { name: 'Initiatives', href: '/initiatives', icon: Icons.Briefcase },
  { name: 'Capacity', href: '/capacity', icon: Icons.Users },
  { name: 'Scenarios', href: '/scenarios', icon: Icons.Layers },
  { name: 'Reports', href: '/reports', icon: Icons.ChartBar },
];

export function Layout() {
  const { sidebar } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Prefetch likely navigation targets during idle time
  useRoutePrefetch();

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 'i',
        alt: true,
        callback: () => navigate('/initiatives'),
        description: 'Go to Initiatives',
      },
      {
        key: 'c',
        alt: true,
        callback: () => navigate('/capacity'),
        description: 'Go to Capacity',
      },
      {
        key: 's',
        alt: true,
        callback: () => navigate('/scenarios'),
        description: 'Go to Scenarios',
      },
      {
        key: 'r',
        alt: true,
        callback: () => navigate('/reports'),
        description: 'Go to Reports',
      },
      {
        key: 'b',
        alt: true,
        callback: () => sidebar.toggleCollapsed(),
        description: 'Toggle sidebar',
      },
    ],
  });

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Skip to main content link */}
      <a href="#main-content" className="skip-to-main">
        Skip to main content
      </a>

      {/* Sidebar */}
      <aside
        role="navigation"
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-30 flex flex-col bg-white border-r border-surface-200 transition-all duration-300 ease-in-out ${
          sidebar.isCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-surface-200">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-soft">
              <span className="text-sm font-bold text-white">P</span>
            </div>
            <span
              className={`font-display font-bold text-lg text-surface-900 whitespace-nowrap transition-opacity duration-200 ${
                sidebar.isCollapsed ? 'opacity-0' : 'opacity-100'
              }`}
            >
              ProductFolio
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Primary navigation" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive =
              location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));

            return (
              <NavLink
                key={item.name}
                to={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-accent-50 text-accent-700'
                    : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
                }`}
                title={sidebar.isCollapsed ? item.name : undefined}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent-500 rounded-r-full" aria-hidden="true" />
                )}

                <span aria-hidden="true">
                  <item.icon />
                </span>

                <span
                  className={`whitespace-nowrap transition-opacity duration-200 ${
                    sidebar.isCollapsed ? 'opacity-0 w-0' : 'opacity-100'
                  }`}
                >
                  {item.name}
                </span>

                {/* Tooltip for collapsed state */}
                {sidebar.isCollapsed && (
                  <div role="tooltip" className="absolute left-full ml-2 px-2 py-1 bg-surface-900 text-white text-xs rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                    {item.name}
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="p-3 border-t border-surface-200">
          <button
            onClick={sidebar.toggleCollapsed}
            className="flex items-center justify-center w-full h-9 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors"
            aria-label={sidebar.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebar.isCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronLeft />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        id="main-content"
        role="main"
        className={`min-h-screen transition-all duration-300 ease-in-out ${
          sidebar.isCollapsed ? 'pl-16' : 'pl-64'
        }`}
      >
        {/* Top header bar with subtle texture */}
        <header role="banner" className="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur-sm border-b border-surface-200">
          <div className="h-full px-6 flex items-center justify-between">
            <Breadcrumb />
            <div className="flex items-center gap-3">
              <UserMenu />
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return <span className="text-sm text-surface-500">Dashboard</span>;
  }

  const breadcrumbMap: Record<string, string> = {
    initiatives: 'Initiatives',
    capacity: 'Capacity',
    scenarios: 'Scenarios',
    reports: 'Reports',
  };

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
      <ol className="flex items-center gap-2">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const isUUID = /^[0-9a-f-]{36}$/i.test(segment);
          const label = breadcrumbMap[segment] || (isUUID ? 'Details' : segment);

          return (
            <li key={segment} className="flex items-center gap-2">
              {index > 0 && <span className="text-surface-300" aria-hidden="true">/</span>}
              <span
                className={isLast ? 'text-surface-900 font-medium' : 'text-surface-500'}
                aria-current={isLast ? 'page' : undefined}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
