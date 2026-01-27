import { useEffect, useRef } from 'react';

interface UseFocusTrapOptions {
  /**
   * Whether the focus trap is active
   */
  isActive: boolean;
  /**
   * Element to return focus to when trap is deactivated
   */
  returnFocusElement?: HTMLElement | null;
  /**
   * Whether to focus the first focusable element when trap is activated
   */
  focusFirstElement?: boolean;
}

/**
 * Hook to trap focus within a container element (e.g., modal, dropdown).
 * Useful for accessibility to prevent keyboard navigation from leaving the container.
 *
 * @example
 * const dialogRef = useFocusTrap({ isActive: isOpen });
 * return <dialog ref={dialogRef}>...</dialog>;
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>({
  isActive,
  returnFocusElement,
  focusFirstElement = true,
}: UseFocusTrapOptions) {
  const containerRef = useRef<T>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;

    // Store the previously focused element
    previousActiveElement.current = returnFocusElement || (document.activeElement as HTMLElement);

    // Get all focusable elements
    const getFocusableElements = (): HTMLElement[] => {
      const elements = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      return Array.from(elements);
    };

    // Focus first element if requested
    if (focusFirstElement) {
      const focusableElements = getFocusableElements();
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }

    // Handle tab key to trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Shift + Tab: move to previous element (or wrap to last)
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      }
      // Tab: move to next element (or wrap to first)
      else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    // Cleanup: return focus to previous element
    return () => {
      container.removeEventListener('keydown', handleKeyDown);

      // Return focus to the element that was focused before the trap
      if (previousActiveElement.current && document.body.contains(previousActiveElement.current)) {
        previousActiveElement.current.focus();
      }
    };
  }, [isActive, returnFocusElement, focusFirstElement]);

  return containerRef;
}
