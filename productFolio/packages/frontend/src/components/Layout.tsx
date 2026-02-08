import { useMemo } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/app.store';
import { useAuthStore } from '../stores/auth.store';
import { UserMenu } from './auth';
import { useRoutePrefetch } from '../hooks/useRoutePrefetch';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useFeatureFlag } from '../hooks/useFeatureFlags';

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

const OrgTreeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
  </svg>
);

const CogIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
  </svg>
);

const CheckBadgeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
  </svg>
);

const FunnelIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
  </svg>
);

const OrgCapacityIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
  </svg>
);

const FlowForecastIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
  </svg>
);

const JobProfileIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" />
  </svg>
);

const FlagIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
  </svg>
);

type NavItem = { name: string; href: string; icon: () => React.JSX.Element };

const coreNavigation: NavItem[] = [
  { name: 'Intake', href: '/intake-requests', icon: FunnelIcon },
  { name: 'Initiatives', href: '/initiatives', icon: Icons.Briefcase },
  { name: 'Employees', href: '/capacity', icon: Icons.Users },
  // Org Capacity inserts here when org_capacity_view flag is enabled
  { name: 'Scenarios', href: '/scenarios', icon: Icons.Layers },
  { name: 'Reports', href: '/reports', icon: Icons.ChartBar },
  { name: 'Delivery', href: '/delivery', icon: CalendarIcon },
  // Flow Forecast inserts here when flow_forecast_v1 flag is enabled
  { name: 'Approvals', href: '/approvals', icon: CheckBadgeIcon },
  { name: 'Org Structure', href: '/admin/org-tree', icon: OrgTreeIcon },
  // Job Profiles inserts here when job_profiles flag is enabled
  // Feature Flags inserts here for ADMIN role
  { name: 'Jira Settings', href: '/admin/jira-settings', icon: CogIcon },
];

export function Layout() {
  const { sidebar } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const { enabled: orgCapacityEnabled } = useFeatureFlag('org_capacity_view');
  const { enabled: jobProfilesEnabled } = useFeatureFlag('job_profiles');
  const { enabled: flowForecastEnabled } = useFeatureFlag('flow_forecast_v1');

  const isAdmin = user?.role === 'ADMIN';

  const navigation = useMemo(() => {
    const nav: NavItem[] = [...coreNavigation];

    // Insert Org Capacity after Employees
    if (orgCapacityEnabled) {
      const capacityIdx = nav.findIndex((item) => item.href === '/capacity');
      nav.splice(capacityIdx + 1, 0, {
        name: 'Org Capacity',
        href: '/org-capacity',
        icon: OrgCapacityIcon,
      });
    }

    // Insert Flow Forecast after Delivery
    if (flowForecastEnabled) {
      const deliveryIdx = nav.findIndex((item) => item.href === '/delivery');
      nav.splice(deliveryIdx + 1, 0, {
        name: 'Flow Forecast',
        href: '/forecast',
        icon: FlowForecastIcon,
      });
    }

    // Insert Job Profiles before Jira Settings (in admin section)
    if (jobProfilesEnabled) {
      const jiraIdx = nav.findIndex((item) => item.href === '/admin/jira-settings');
      nav.splice(jiraIdx, 0, {
        name: 'Job Profiles',
        href: '/admin/job-profiles',
        icon: JobProfileIcon,
      });
    }

    // Insert Feature Flags admin before Jira Settings (ADMIN only, no flag gate)
    if (isAdmin) {
      const jiraIdx = nav.findIndex((item) => item.href === '/admin/jira-settings');
      nav.splice(jiraIdx, 0, {
        name: 'Feature Flags',
        href: '/admin/feature-flags',
        icon: FlagIcon,
      });
    }

    return nav;
  }, [orgCapacityEnabled, jobProfilesEnabled, flowForecastEnabled, isAdmin]);

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
        description: 'Go to Employees',
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
        key: 'd',
        alt: true,
        callback: () => navigate('/delivery'),
        description: 'Go to Delivery Forecast',
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
    intake: 'Jira Items',
    'intake-requests': 'Intake Pipeline',
    capacity: 'Employees',
    'org-capacity': 'Org Capacity',
    scenarios: 'Scenarios',
    reports: 'Reports',
    delivery: 'Delivery Forecast',
    forecast: 'Flow Forecast',
    approvals: 'Approvals',
    admin: 'Admin',
    'org-tree': 'Org Structure',
    'job-profiles': 'Job Profiles',
    'feature-flags': 'Feature Flags',
    'jira-settings': 'Jira Settings',
    'token-ledger': 'Token Ledger',
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
