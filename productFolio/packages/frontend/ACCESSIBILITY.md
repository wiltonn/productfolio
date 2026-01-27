# Accessibility Implementation Guide

This document outlines the accessibility improvements implemented in ProductFolio and provides guidelines for maintaining WCAG 2.1 AA compliance.

## Overview

ProductFolio is designed to be accessible to all users, including those using assistive technologies like screen readers, keyboard-only navigation, and other accessibility tools.

## Key Features

### 1. Keyboard Navigation

All interactive elements are fully accessible via keyboard:

- **Tab/Shift+Tab**: Navigate between focusable elements
- **Enter/Space**: Activate buttons and links
- **Escape**: Close modals, dropdowns, and menus
- **Arrow Keys**: Navigate within dropdowns, menus, and lists
- **Home/End**: Jump to first/last item in lists

#### Global Keyboard Shortcuts

- **Alt+I**: Navigate to Initiatives page
- **Alt+C**: Navigate to Capacity page
- **Alt+S**: Navigate to Scenarios page
- **Alt+R**: Navigate to Reports page
- **Alt+B**: Toggle sidebar collapse/expand
- **/**: Focus search input (when available)

### 2. Focus Management

- **Focus Traps**: Modals and dropdowns trap focus, preventing keyboard navigation from escaping the component
- **Focus Return**: When a modal/dropdown closes, focus returns to the triggering element
- **Visible Focus Indicators**: All interactive elements have clear focus indicators (blue ring)
- **Skip to Main Content**: A skip link allows users to bypass navigation and jump directly to main content

### 3. ARIA Labels and Roles

All components use proper ARIA attributes:

- **role**: Semantic roles for custom components (menu, menuitem, toolbar, etc.)
- **aria-label**: Descriptive labels for icon-only buttons
- **aria-labelledby**: Associates labels with form controls
- **aria-describedby**: Provides additional context for form fields
- **aria-expanded**: Indicates open/closed state of dropdowns
- **aria-haspopup**: Indicates elements that trigger popups
- **aria-selected**: Indicates selected items in lists
- **aria-live**: Announces dynamic content updates to screen readers
- **aria-current**: Indicates the current page in navigation

### 4. Screen Reader Support

- **Announcements**: Dynamic updates are announced via ARIA live regions
- **Status Updates**: Toast notifications are announced with appropriate priority
- **Selection Changes**: Bulk selection operations are announced
- **Navigation**: Current page and breadcrumb location are clearly communicated
- **Hidden Content**: Decorative icons and visual elements are hidden from screen readers with `aria-hidden="true"`

### 5. Color Contrast

All text and interactive elements meet WCAG AA contrast requirements:

- **Normal Text**: Minimum contrast ratio of 4.5:1
- **Large Text**: Minimum contrast ratio of 3:1
- **UI Components**: Minimum contrast ratio of 3:1

### 6. Form Accessibility

- All form inputs have associated labels
- Required fields are clearly marked
- Error messages are announced to screen readers
- Field descriptions provide additional context
- Validation errors are associated with inputs via `aria-describedby`

## Component-Specific Features

### Select Component

- Full keyboard navigation (Arrow keys, Home, End, Enter, Escape)
- ARIA listbox/option roles
- Screen reader announcements for selection changes
- Clear button with accessible label

### MultiSelect Component

- Multiple selection support with keyboard
- Selection count announced to screen readers
- Visual and semantic indication of selected items
- Clear all functionality with announcement

### SearchInput Component

- Search role for semantic meaning
- Escape key to clear search
- Debounced announcements for search results
- Clear button with accessible label

### Toaster Component

- Auto-announcement of notifications
- Dismissible with accessible close button
- Priority-based announcements (polite vs assertive)
- Proper icon labeling

### BulkActionsBar Component

- Toolbar role for semantic grouping
- Selection count announced dynamically
- All actions have descriptive labels
- Focus trap in status menu

### UserMenu Component

- Menu/menuitem ARIA roles
- Focus trap when open
- Escape key to close
- Keyboard navigation support

### Layout/Navigation

- Skip to main content link
- Semantic navigation landmarks
- Current page indication
- Breadcrumb navigation
- Global keyboard shortcuts

## Utilities and Hooks

### useFocusTrap

Traps focus within a container (modal, dropdown) and returns it to the triggering element when closed.

```tsx
const dialogRef = useFocusTrap({
  isActive: isOpen,
  returnFocusElement: buttonRef.current,
  focusFirstElement: true,
});
```

### useKeyboardShortcuts

Registers global keyboard shortcuts with description.

```tsx
useKeyboardShortcuts({
  shortcuts: [
    {
      key: 's',
      ctrl: true,
      callback: handleSave,
      description: 'Save changes',
    },
  ],
});
```

### Accessibility Utilities

Located in `/lib/accessibility.ts`:

- `announceToScreenReader()`: Announce messages to screen readers
- `generateA11yId()`: Generate unique IDs for ARIA attributes
- `getFocusableElements()`: Get all focusable elements in a container
- `meetsWCAGAA()`: Check if color contrast meets WCAG AA standards
- `prefersReducedMotion()`: Check if user prefers reduced motion
- `prefersDarkMode()`: Check if user prefers dark mode

## Testing Accessibility

### Manual Testing

1. **Keyboard Navigation**: Navigate the entire application using only the keyboard
2. **Screen Reader**: Test with NVDA (Windows), JAWS (Windows), or VoiceOver (Mac)
3. **Zoom**: Test at 200% zoom level
4. **High Contrast**: Test in high contrast mode
5. **Color Blindness**: Use browser extensions to simulate color vision deficiencies

### Automated Testing

Consider using these tools:

- **axe DevTools**: Browser extension for automated accessibility testing
- **WAVE**: Web accessibility evaluation tool
- **Lighthouse**: Built-in Chrome DevTools audit
- **pa11y**: Command-line accessibility testing tool

## Best Practices

1. **Always provide text alternatives** for images and icons
2. **Use semantic HTML** (button, nav, main, etc.) before ARIA
3. **Test with real assistive technologies** - automated tools catch ~30% of issues
4. **Ensure keyboard focus is always visible** - never use `outline: none` without a replacement
5. **Use aria-label for icon-only buttons** - screen reader users need context
6. **Announce dynamic content changes** - use `announceToScreenReader()` for important updates
7. **Provide multiple ways to navigate** - keyboard shortcuts, breadcrumbs, skip links
8. **Test with actual users** - people with disabilities are the best testers

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Resources](https://webaim.org/resources/)
- [The A11Y Project](https://www.a11yproject.com/)
- [Inclusive Components](https://inclusive-components.design/)

## Future Enhancements

- [ ] Add high contrast mode theme toggle
- [ ] Implement comprehensive keyboard shortcut help dialog (Ctrl/Cmd+?)
- [ ] Add text scaling controls
- [ ] Implement reduced motion mode
- [ ] Add focus indicators for touch/mouse vs keyboard
- [ ] Implement more comprehensive error announcements
- [ ] Add ARIA live region for table updates
- [ ] Create accessibility statement page

## Reporting Issues

If you encounter any accessibility issues, please report them with:

1. Description of the issue
2. Steps to reproduce
3. Assistive technology used (if applicable)
4. Browser and version
5. Expected behavior

## Contact

For accessibility questions or concerns, contact the development team.
