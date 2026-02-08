import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { toast } from '../stores/toast';

// ============================================================================
// Auth0 Admin Hooks
// ============================================================================

export function useSyncRoles() {
  return useMutation({
    mutationFn: () => api.post('/admin/auth0/sync-roles'),
    onSuccess: () => toast.success('Roles synced to Auth0'),
    onError: (err: Error) => toast.error(err.message || 'Failed to sync roles'),
  });
}

export function useSyncAllUsers() {
  return useMutation({
    mutationFn: () => api.post('/admin/auth0/sync-all-users'),
    onSuccess: () => toast.success('All users synced to Auth0'),
    onError: (err: Error) => toast.error(err.message || 'Failed to sync users'),
  });
}

export function useSyncUser() {
  return useMutation({
    mutationFn: (userId: string) => api.post(`/admin/auth0/sync-user/${userId}`),
    onSuccess: () => toast.success('User synced to Auth0'),
    onError: (err: Error) => toast.error(err.message || 'Failed to sync user'),
  });
}
