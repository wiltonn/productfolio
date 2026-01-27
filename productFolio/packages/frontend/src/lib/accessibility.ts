/**
 * Accessibility utilities for managing focus, announcements, and ARIA attributes
 */

/**
 * Announce a message to screen readers using an ARIA live region
 */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite') {
  // Find or create the live region
  let liveRegion = document.getElementById('a11y-live-region');

  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'a11y-live-region';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    document.body.appendChild(liveRegion);
  } else {
    liveRegion.setAttribute('aria-live', priority);
  }

  // Clear and set the message
  liveRegion.textContent = '';
  setTimeout(() => {
    liveRegion!.textContent = message;
  }, 100);
}

/**
 * Generate a unique ID for accessibility attributes
 */
let idCounter = 0;
export function generateA11yId(prefix = 'a11y'): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

/**
 * Check if the current element or any of its parents match a selector
 */
export function isOrContains(element: HTMLElement | null, selector: string): boolean {
  if (!element) return false;
  return element.matches(selector) || element.closest(selector) !== null;
}

/**
 * Get the first focusable element within a container
 */
export function getFirstFocusableElement(container: HTMLElement): HTMLElement | null {
  const elements = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return elements[0] || null;
}

/**
 * Get all focusable elements within a container
 */
export function getAllFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(elements);
}

/**
 * Check if an element is currently visible
 */
export function isElementVisible(element: HTMLElement): boolean {
  return !!(
    element.offsetWidth ||
    element.offsetHeight ||
    element.getClientRects().length
  );
}

/**
 * Get contrast ratio between two colors (simplified version)
 * Returns a value between 1 (no contrast) and 21 (maximum contrast)
 */
export function getContrastRatio(foreground: string, background: string): number {
  const getLuminance = (color: string): number => {
    // This is a simplified version - in production use a proper color library
    const rgb = color.match(/\d+/g);
    if (!rgb) return 0;

    const [r, g, b] = rgb.map(Number);
    const [rs, gs, bs] = [r, g, b].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a color contrast meets WCAG AA standards
 * @param foreground - Foreground color
 * @param background - Background color
 * @param isLargeText - Whether the text is large (18pt+ or 14pt+ bold)
 * @returns true if contrast meets WCAG AA standards
 */
export function meetsWCAGAA(
  foreground: string,
  background: string,
  isLargeText = false
): boolean {
  const ratio = getContrastRatio(foreground, background);
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Visually hidden class for screen reader only content
 * Add this to your global CSS or use the sr-only utility class
 */
export const srOnlyStyles: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Create an accessible label for a form field
 */
export function createFieldLabel(label: string, required?: boolean): string {
  return required ? `${label} (required)` : label;
}

/**
 * Check if reduced motion is preferred
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Check if user prefers dark mode
 */
export function prefersDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
