import { useState, useEffect } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { formatShortcut } from '../../hooks/useKeyboardShortcuts';

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    keys: string;
    description: string;
  }>;
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'Alt+I', description: 'Go to Initiatives' },
      { keys: 'Alt+C', description: 'Go to Capacity' },
      { keys: 'Alt+S', description: 'Go to Scenarios' },
      { keys: 'Alt+R', description: 'Go to Reports' },
      { keys: 'Alt+B', description: 'Toggle sidebar' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: '/', description: 'Focus search' },
      { keys: 'Escape', description: 'Close dialog/menu' },
      { keys: '?', description: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Accessibility',
    shortcuts: [
      { keys: 'Tab', description: 'Navigate forward' },
      { keys: 'Shift+Tab', description: 'Navigate backward' },
      { keys: 'Enter', description: 'Activate button/link' },
      { keys: 'Space', description: 'Activate button/checkbox' },
      { keys: 'Arrow Keys', description: 'Navigate within menus/lists' },
    ],
  },
];

export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    focusFirstElement: true,
  });

  // Open help with ? key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Don't trigger if user is typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setIsOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-raised max-w-2xl w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <h2 id="shortcuts-title" className="text-xl font-display font-bold text-surface-900">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close keyboard shortcuts help"
            className="p-1 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto">
          <div className="space-y-6">
            {shortcutGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-3">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between py-2">
                      <span className="text-sm text-surface-700">{shortcut.description}</span>
                      <kbd className="px-2 py-1 text-xs font-mono font-semibold text-surface-600 bg-surface-100 border border-surface-300 rounded shadow-sm">
                        {shortcut.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-50 border-t border-surface-200">
          <p className="text-xs text-surface-500">
            Press <kbd className="px-1.5 py-0.5 text-xs font-mono font-semibold text-surface-600 bg-white border border-surface-300 rounded">?</kbd> anytime to view these shortcuts, or <kbd className="px-1.5 py-0.5 text-xs font-mono font-semibold text-surface-600 bg-white border border-surface-300 rounded">Escape</kbd> to close.
          </p>
        </div>
      </div>
    </div>
  );
}
