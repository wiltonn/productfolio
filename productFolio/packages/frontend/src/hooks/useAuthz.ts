import { useAuthStore } from '../stores/auth.store';
import type { SeatType } from '../stores/auth.store';

export function useAuthz() {
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? [];

  return {
    permissions,
    hasPermission: (p: string) => permissions.includes(p),
    hasAny: (ps: string[]) => ps.some((p) => permissions.includes(p)),
    hasAll: (ps: string[]) => ps.every((p) => permissions.includes(p)),
    isAdmin: permissions.includes('authority:admin'),
    seatType: (user?.seatType ?? 'observer') as SeatType,
    isLicensed: user?.seatType === 'decision',
    tier: user?.tier ?? 'starter',
  };
}
