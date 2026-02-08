import { useState, useRef, useEffect, useId } from 'react';
import { useLogout } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/auth.store';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    returnFocusElement: buttonRef.current,
    focusFirstElement: true,
  });
  const user = useAuthStore((state) => state.user);
  const { logout, isPending } = useLogout();
  const menuId = useId();

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

  // Close menu on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

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
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        aria-label={`User menu for ${user.name}`}
        className="flex items-center gap-2 p-1 rounded-lg hover:bg-surface-100 transition-colors focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <div className="w-8 h-8 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center" aria-hidden="true">
          <span className="text-xs font-semibold">{initials}</span>
        </div>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          id={menuId}
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu-button"
          className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-surface-200 py-1 z-50"
        >
          {/* User Info */}
          <div className="px-4 py-3 border-b border-surface-100" role="presentation">
            <p className="text-sm font-medium text-surface-900 truncate">
              {user.name}
            </p>
            <p className="text-xs text-surface-500 truncate">{user.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-surface-100 text-surface-600 rounded" aria-label={`Role: ${roleLabel[user.role] || user.role}`}>
              {roleLabel[user.role] || user.role}
            </span>
          </div>

          {/* Menu Items */}
          <div className="py-1" role="none">
            <button
              role="menuitem"
              onClick={() => logout()}
              disabled={isPending}
              className="w-full px-4 py-2 text-left text-sm text-surface-700 hover:bg-surface-50 disabled:opacity-50 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
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
