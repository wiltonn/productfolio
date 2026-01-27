import { useState, useRef, useEffect } from 'react';
import { useLogout } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/auth.store';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((state) => state.user);
  const { mutate: logout, isPending } = useLogout();

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const roleLabel: Record<string, string> = {
    ADMIN: 'Admin',
    PRODUCT_OWNER: 'Product Owner',
    BUSINESS_OWNER: 'Business Owner',
    RESOURCE_MANAGER: 'Resource Manager',
    VIEWER: 'Viewer',
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-lg hover:bg-surface-100 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="w-8 h-8 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center">
          <span className="text-xs font-semibold">{initials}</span>
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-surface-200 py-1 z-50">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-surface-100">
            <p className="text-sm font-medium text-surface-900 truncate">
              {user.name}
            </p>
            <p className="text-xs text-surface-500 truncate">{user.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-surface-100 text-surface-600 rounded">
              {roleLabel[user.role] || user.role}
            </span>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <button
              onClick={() => logout()}
              disabled={isPending}
              className="w-full px-4 py-2 text-left text-sm text-surface-700 hover:bg-surface-50 disabled:opacity-50 flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
                />
              </svg>
              {isPending ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
