import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  callback: () => void;
  description: string;
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

/**
 * Hook to register keyboard shortcuts.
 * Shortcuts are active when the hook is mounted and enabled.
 *
 * @example
 * useKeyboardShortcuts({
 *   shortcuts: [
 *     { key: 's', ctrl: true, callback: handleSave, description: 'Save' },
 *     { key: '/', callback: focusSearch, description: 'Focus search' },
 *   ],
 * });
 */
export function useKeyboardShortcuts({ shortcuts, enabled = true }: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs, textareas, or contenteditable elements
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Exception: allow '/' key to work even in inputs (common for search)
        if (event.key !== '/') return;
      }

      for (const shortcut of shortcuts) {
        const matchesKey = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const matchesCtrl = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey;
        const matchesAlt = shortcut.alt ? event.altKey : !event.altKey;
        const matchesShift = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const matchesMeta = shortcut.meta ? event.metaKey : true;

        if (matchesKey && matchesCtrl && matchesAlt && matchesShift && matchesMeta) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.callback();
          break;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

/**
 * Format a keyboard shortcut for display
 * @example formatShortcut({ key: 's', ctrl: true }) => 'Ctrl+S'
 */
export function formatShortcut(shortcut: Omit<KeyboardShortcut, 'callback' | 'description'>): string {
  const parts: string[] = [];

  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');

  if (shortcut.ctrl) parts.push(isMac ? '⌘' : 'Ctrl');
  if (shortcut.alt) parts.push(isMac ? '⌥' : 'Alt');
  if (shortcut.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (shortcut.meta && !shortcut.ctrl) parts.push('⌘');

  parts.push(shortcut.key.toUpperCase());

  return parts.join('+');
}
