# Frontend UI Components

Reference documentation for all reusable components in `packages/frontend/src/components/`, the API client, and utility functions.

---

## Table of Contents

- [UI Library (`components/ui/`)](#ui-library-componentsui)
  - [Modal](#modal)
  - [Select](#select)
  - [MultiSelect](#multiselect)
  - [SearchInput](#searchinput)
  - [VirtualTable](#virtualtable)
  - [Checkbox](#checkbox)
  - [StatusBadge](#statusbadge)
  - [DeliveryHealthBadge](#deliveryhealthbadge)
  - [ProgressBar](#progressbar)
  - [Tag](#tag)
  - [BulkActionsBar](#bulkactionsbar)
  - [Toaster](#toaster)
  - [ErrorBoundary](#errorboundary)
  - [Skeleton](#skeleton)
  - [LoadingSkeleton](#loadingskeleton)
  - [EmptyState](#emptystate)
  - [OfflineIndicator](#offlineindicator)
  - [KeyboardShortcutsHelp](#keyboardshortcutshelp)
- [Feature Components (`components/`)](#feature-components-components)
  - [Layout](#layout)
  - [ApprovalStatusBanner](#approvalstatusbanner)
  - [CreateInitiativeModal](#createinitiativemodal)
  - [CreateIntakeRequestModal](#createintakerequestmodal)
  - [ConvertToInitiativeModal](#converttoinitiativemodal)
  - [OrgTreeSelector (TreeNodeItem)](#orgtreeselector-treenodeitem)
  - [OriginBadge](#originbadge)
- [Auth Components (`components/auth/`)](#auth-components-componentsauth)
  - [LoginPage](#loginpage)
  - [ProtectedRoute](#protectedroute)
  - [UserMenu](#usermenu)
- [API Client (`api/client.ts`)](#api-client-apiclientts)
- [Utilities (`utils/`)](#utilities-utils)

---

## UI Library (`components/ui/`)

All UI components are re-exported from `components/ui/index.ts` for convenient barrel imports:

```ts
import { Modal, Select, VirtualTable, StatusBadge } from '../components/ui';
```

---

### Modal

**File:** `components/ui/Modal.tsx`

Dialog overlay component built on the native `<dialog>` element.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | required | Controls visibility of the modal |
| `onClose` | `() => void` | required | Called when the modal should close |
| `title` | `string` | required | Header text displayed in the modal |
| `children` | `React.ReactNode` | required | Modal body content |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Width of the modal (`max-w-sm` through `max-w-2xl`) |

**Key behaviors:**
- Uses `HTMLDialogElement.showModal()` for native dialog behavior with backdrop
- Closes on Escape key (via `cancel` event interception)
- Closes on backdrop click (click on dialog element itself)
- Renders nothing when `isOpen` is false
- Includes a close button (X) in the header

---

### Select

**File:** `components/ui/Select.tsx`

Single-value dropdown select with keyboard navigation and accessibility support.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `SelectOption[]` | required | Array of `{ value, label, color? }` |
| `value` | `string` | required | Currently selected value |
| `onChange` | `(value: string) => void` | required | Called when selection changes |
| `placeholder` | `string` | `'Select...'` | Placeholder text when no value selected |
| `label` | `string` | - | Optional label rendered above the select |
| `className` | `string` | `''` | Additional CSS classes |
| `allowClear` | `boolean` | `true` | Whether to show a clear (X) button |
| `disabled` | `boolean` | `false` | Disables interaction |
| `aria-describedby` | `string` | - | Associates with a description element |

**Key behaviors:**
- Full keyboard navigation: Arrow keys, Enter/Space to select, Escape to close, Home/End
- Focus trap via `useFocusTrap` hook when dropdown is open
- Screen reader announcements via `announceToScreenReader` on selection/clear
- Optional color dot indicator per option
- Checkmark icon for selected option
- Click-outside to close

---

### MultiSelect

**File:** `components/ui/MultiSelect.tsx`

Multi-value dropdown select with checkbox indicators.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `SelectOption[]` | required | Array of `{ value, label, color? }` |
| `value` | `string[]` | required | Currently selected values |
| `onChange` | `(value: string[]) => void` | required | Called when selection changes |
| `placeholder` | `string` | `'Select...'` | Placeholder when nothing selected |
| `label` | `string` | - | Optional label |
| `className` | `string` | `''` | Additional CSS classes |
| `disabled` | `boolean` | `false` | Disables interaction |
| `aria-describedby` | `string` | - | Associates with a description element |

**Shared type:**

```ts
export interface SelectOption {
  value: string;
  label: string;
  color?: string;
}
```

**Key behaviors:**
- Checkbox indicators for each option in the dropdown
- Displays "N selected" when more than one item is chosen
- "Clear all" button when any items are selected
- Same keyboard navigation pattern as Select
- `aria-multiselectable="true"` on the listbox
- Screen reader announcements on toggle/clear

---

### SearchInput

**File:** `components/ui/SearchInput.tsx`

Debounced search input with magnifying glass icon and clear button.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | required | Controlled search value |
| `onChange` | `(value: string) => void` | required | Called after debounce with new value |
| `placeholder` | `string` | `'Search...'` | Placeholder text |
| `debounceMs` | `number` | `200` | Debounce delay in milliseconds |
| `className` | `string` | `''` | Additional CSS classes |
| `label` | `string` | - | Optional label above the input |
| `aria-label` | `string` | - | Accessible label |
| `aria-describedby` | `string` | - | Description association |

**Key behaviors:**
- Internal state with configurable debounce before firing `onChange`
- Search icon (magnifying glass) on the left
- Clear button (X) appears when input has a value
- Escape key clears the input
- Screen reader announcement on search and clear
- Uses `role="searchbox"` and proper `type="search"`

---

### VirtualTable

**File:** `components/ui/VirtualTable.tsx`

Generic virtualized table built on `@tanstack/react-table` and `@tanstack/react-virtual`.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `T[]` | required | Array of row data |
| `columns` | `ColumnDef<T, unknown>[]` | required | TanStack Table column definitions |
| `rowHeight` | `number` | `52` | Height of each row in pixels |
| `enableRowSelection` | `boolean` | `false` | Enable checkbox row selection |
| `rowSelection` | `RowSelectionState` | `{}` | Controlled selection state |
| `onRowSelectionChange` | `OnChangeFn<RowSelectionState>` | - | Selection change handler |
| `sorting` | `SortingState` | `[]` | Controlled sorting state |
| `onSortingChange` | `OnChangeFn<SortingState>` | - | Sorting change handler |
| `globalFilter` | `string` | `''` | Global text filter |
| `onRowClick` | `(row: T) => void` | - | Row click handler |
| `getRowId` | `(row: T) => string` | - | Custom row ID accessor |
| `isLoading` | `boolean` | `false` | Shows spinner when true |
| `emptyMessage` | `string` | `'No items found'` | Message shown when no data |

**Key behaviors:**
- Windowed rendering with 15-row overscan for smooth scrolling
- Column sorting with visual indicators (arrows)
- Sticky header row with backdrop blur
- Global filter support via `getFilteredRowModel`
- Loading spinner state
- Empty state with icon and message
- Selected row highlighting
- Cursor pointer on rows when `onRowClick` is provided

---

### Checkbox

**File:** `components/ui/Checkbox.tsx`

Styled checkbox with indeterminate state support.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `indeterminate` | `boolean` | `false` | Shows a minus icon instead of check |
| `checked` | `boolean` | - | Checked state |
| `...rest` | `ComponentPropsWithoutRef<'input'>` | - | All native input props except `type` |

**Key behaviors:**
- Uses `forwardRef` for ref forwarding
- Custom styled with Tailwind (`appearance-none`) and overlay SVG icons
- Animated check/minus icon transitions
- Accent color when checked
- Proper focus-visible ring for keyboard navigation
- Sets `el.indeterminate` imperatively on the DOM element

---

### StatusBadge

**File:** `components/ui/StatusBadge.tsx`

Colored pill badge for initiative workflow statuses.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `status` | `InitiativeStatus` | required | One of: `PROPOSED`, `SCOPING`, `RESOURCING`, `IN_EXECUTION`, `COMPLETE`, `ON_HOLD`, `CANCELLED` |
| `size` | `'sm' \| 'md'` | `'md'` | Badge size |

**Status color mapping:**

| Status | Color | Label |
|--------|-------|-------|
| `PROPOSED` | Gray | Proposed |
| `SCOPING` | Amber | Scoping |
| `RESOURCING` | Sky | Resourcing |
| `IN_EXECUTION` | Emerald | In Execution |
| `COMPLETE` | Violet | Complete |
| `ON_HOLD` | Orange | On Hold |
| `CANCELLED` | Red | Cancelled |

**Key behaviors:**
- Colored dot indicator before the label
- Tooltip with workflow guidance (e.g., "Define scope items with skill demands...")
- Falls back to `PROPOSED` styling for unknown statuses

---

### DeliveryHealthBadge

**File:** `components/ui/DeliveryHealthBadge.tsx`

Colored pill badge for delivery health status.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `health` | `DeliveryHealth` | required | One of: `ON_TRACK`, `AT_RISK`, `DELAYED` |
| `size` | `'sm' \| 'md'` | `'md'` | Badge size |

**Health color mapping:**

| Health | Color | Label |
|--------|-------|-------|
| `ON_TRACK` | Emerald | On Track |
| `AT_RISK` | Amber | At Risk |
| `DELAYED` | Red | Delayed |

**Key behaviors:**
- Returns `null` if the health value has no matching config
- Same visual pattern as StatusBadge (colored dot + label)

---

### ProgressBar

**File:** `components/ui/ProgressBar.tsx`

Horizontal progress bar with optional percentage label.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number` | required | Current value |
| `max` | `number` | `100` | Maximum value |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Bar height (`h-1`, `h-1.5`, `h-2`) |
| `status` | `'default' \| 'success' \| 'warning' \| 'danger'` | `'default'` | Color variant |
| `showValue` | `boolean` | `false` | Whether to show percentage text |

**Key behaviors:**
- Percentage capped at 100%
- Animated width transition (`transition-all duration-500`)
- Status colors: accent (default), emerald (success), amber (warning), red (danger)
- Optional monospace percentage label right-aligned

---

### Tag

**File:** `components/ui/Tag.tsx`

Colored label tag with optional remove button.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | required | Tag text |
| `color` | `string` | - | Tailwind color classes (e.g., `'bg-blue-100 text-blue-700'`). If omitted, a deterministic color is generated from the label string |
| `onRemove` | `() => void` | - | If provided, renders a remove (X) button |
| `size` | `'sm' \| 'md'` | `'md'` | Tag size |

**Key behaviors:**
- Deterministic color assignment: hashes the label string to pick from 14 predefined color pairs (rose, pink, fuchsia, purple, violet, indigo, blue, sky, cyan, teal, emerald, lime, amber, orange)
- Same label always gets the same color
- Remove button stops click propagation

---

### BulkActionsBar

**File:** `components/ui/BulkActionsBar.tsx`

Fixed-position toolbar that appears at the bottom of the viewport when items are selected.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `selectedCount` | `number` | required | Number of selected items |
| `onClearSelection` | `() => void` | required | Clear all selections |
| `onStatusChange` | `(status: InitiativeStatus) => void` | required | Bulk status change handler |
| `onAddTags` | `(tags: string[]) => void` | required | Bulk tag addition handler |
| `onDelete` | `() => void` | - | Optional bulk delete handler |

**Key behaviors:**
- Fixed at `bottom-6`, centered horizontally, dark background (`bg-surface-900`)
- Slide-up animation on appear
- Status change dropdown menu (all 7 initiative statuses)
- Inline tag input with Enter to confirm, Escape to cancel
- Delete button (conditionally rendered if `onDelete` provided)
- Selection count badge
- Screen reader announcements for all actions
- Focus trap on status dropdown
- `role="toolbar"` with `aria-label="Bulk actions"`

---

### Toaster

**File:** `components/ui/Toaster.tsx`

Toast notification container that reads from the global toast store.

**Props:** None (reads from `useToastStore()`)

**Toast types:** `success`, `error`, `info`, `warning`

**Key behaviors:**
- Fixed at `bottom-4 right-4`, stacked vertically
- Each toast has a type-specific color scheme, icon, and ARIA priority
- `success`/`info` use `polite` live region; `error`/`warning` use `assertive`
- Dismiss button per toast
- Slide-in animation from the right
- Screen reader announcements for new toasts
- Renders nothing when toast list is empty

**Usage (from any component):**

```ts
import { toast } from '../stores/toast';
toast.success('Initiative created');
toast.error('Failed to save');
```

---

### ErrorBoundary

**File:** `components/ui/ErrorBoundary.tsx`

React class component error boundary with multiple fallback variants.

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `ErrorBoundary` | Class component | The error boundary wrapper |
| `DefaultErrorFallback` | Function component | Full-page error display with "Try Again" and "Go Home" buttons, technical details collapsible |
| `CompactErrorFallback` | Function component | Smaller inline error display |
| `withErrorBoundary` | HOC | Wraps a component with an ErrorBoundary |

**ErrorBoundary Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | required | Content to protect |
| `fallback` | `(error: Error, reset: () => void) => ReactNode` | - | Custom fallback renderer |
| `onError` | `(error: Error, errorInfo: ErrorInfo) => void` | - | Error callback for logging |

**Key behaviors:**
- `getDerivedStateFromError` captures the error
- `componentDidCatch` logs and calls `onError`
- `resetError` method clears error state for retry
- Default fallback shows error name, message, and stack trace in a collapsible `<details>` element
- "Go Home" button navigates to `/`

---

### Skeleton

**File:** `components/ui/Skeleton.tsx`

Base skeleton placeholder component and specialized variants for common layouts.

**Base `Skeleton` Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'text' \| 'circular' \| 'rectangular'` | `'rectangular'` | Shape variant |
| `width` | `string \| number` | - | Width (number = px) |
| `height` | `string \| number` | - | Height (number = px) |
| `animation` | `'pulse' \| 'wave' \| 'none'` | `'pulse'` | Animation style |

**Specialized variants (all exported):**

| Component | Props | Description |
|-----------|-------|-------------|
| `SkeletonText` | `lines?: number`, `lastLineWidth?: string` | Multi-line text placeholder |
| `SkeletonAvatar` | `size?: number` | Circular avatar placeholder |
| `SkeletonButton` | `width?: number` | Button-shaped placeholder |
| `SkeletonTable` | `rows?: number`, `columns?: number` | Table with header and rows |
| `SkeletonCard` | - | Card with title, text, avatar, and stats grid |
| `SkeletonForm` | `fields?: number` | Form with label/input pairs and buttons |
| `SkeletonStatsCard` | - | Stats card with label, value, and icon |
| `SkeletonInitiativesList` | `count?: number` | Initiative list rows |
| `SkeletonScenarioCard` | - | Scenario card layout |
| `SkeletonEmployeeRow` | - | Employee table row |
| `SkeletonDetailPage` | - | Full detail page layout (header, stats, content sections) |

---

### LoadingSkeleton

**File:** `components/ui/LoadingSkeleton.tsx`

Page-level loading components for route transitions and inline loading states.

**Exports:**

| Component | Props | Description |
|-----------|-------|-------------|
| `PageLoadingSkeleton` | None | Full page skeleton with header, stats cards, filter bar, and table rows. Used as `Suspense` fallback for lazy-loaded routes. Memoized. |
| `LoadingSpinner` | `size?: 'sm' \| 'md' \| 'lg'`, `className?: string` | Inline spinning SVG indicator. Memoized. |
| `CenteredLoader` | `message?: string` | Centered spinner with text message (default: "Loading..."). Memoized. |
| `DetailPageSkeleton` | None | Skeleton for detail pages (back link, header, tabs, 3-column content grid). Memoized. |
| `PlannerPageSkeleton` | None | Skeleton for the scenario planner (header bar, left/right panels). Memoized. |

---

### EmptyState

**File:** `components/ui/EmptyState.tsx`

Configurable empty state display with predefined variants for common entities.

**Base `EmptyState` Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `ReactNode` | Default box icon | Custom icon element |
| `title` | `string` | required | Heading text |
| `description` | `string` | - | Subtext below the title |
| `action` | `{ label: string, onClick: () => void, variant?: 'primary' \| 'secondary' }` | - | CTA button |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Controls padding, icon size, and text size |

**Predefined variants (all exported):**

| Component | Props | Description |
|-----------|-------|-------------|
| `EmptyInitiatives` | `onCreate?: () => void` | "No initiatives yet" |
| `EmptyEmployees` | `onAdd?: () => void` | "No team members yet" |
| `EmptyScenarios` | `onCreate?: () => void` | "No scenarios yet" |
| `EmptyAllocations` | `onCreate?: () => void` | "No allocations yet" (size `sm`) |
| `EmptyScopeItems` | `onCreate?: () => void` | "No scope items yet" (size `sm`) |
| `EmptySearchResults` | `onClear?: () => void` | "No results found" (secondary button, size `sm`) |

---

### OfflineIndicator

**File:** `components/ui/OfflineIndicator.tsx`

Network status banner that appears when the browser goes offline.

**Props:** None (uses browser `navigator.onLine` and online/offline events)

**Key behaviors:**
- Fixed at `top-4`, centered horizontally, highest z-index (`z-[60]`)
- Shows a dark banner with warning icon when offline: "No internet connection"
- Shows a green "Back online" banner for 3 seconds after reconnection
- Renders nothing when online and not recently reconnected

**Also exports:** `useOnlineStatus()` hook that returns a boolean `isOnline` value.

---

### KeyboardShortcutsHelp

**File:** `components/ui/KeyboardShortcutsHelp.tsx`

Keyboard shortcut reference dialog, triggered by pressing `?`.

**Props:** None (self-contained)

**Shortcut groups:**

| Group | Shortcuts |
|-------|-----------|
| **Navigation** | `Alt+I` Initiatives, `Alt+C` Capacity, `Alt+S` Scenarios, `Alt+R` Reports, `Alt+B` Toggle sidebar |
| **General** | `/` Focus search, `Escape` Close dialog/menu, `?` Show shortcuts |
| **Accessibility** | `Tab`/`Shift+Tab` navigate, `Enter`/`Space` activate, `Arrow Keys` within menus |

**Key behaviors:**
- Opens with `?` key (unless user is in an input/textarea/contenteditable)
- Closes with Escape key or backdrop click
- Focus trap when open
- Scrollable content area for long shortcut lists
- `role="dialog"` with `aria-modal="true"`

---

## Feature Components (`components/`)

---

### Layout

**File:** `components/Layout.tsx`

Application shell with collapsible sidebar navigation, top header bar, and breadcrumbs.

**Props:** None (uses React Router `<Outlet />`)

**Structure:**
- **Sidebar** (`<aside>`): Fixed left panel with logo, navigation links, and collapse toggle
  - Width: 256px expanded (`w-64`), 64px collapsed (`w-16`)
  - Tooltips shown on collapsed items
  - Active route indicated by accent-colored left bar and background
- **Header** (`<header>`): Sticky top bar with breadcrumb navigation and UserMenu
  - Backdrop blur effect (`backdrop-blur-sm`)
- **Main content**: `<Outlet />` wrapped in padding, shifts based on sidebar width
- **Skip link**: "Skip to main content" link for accessibility

**Navigation items (core):**
- Intake, Initiatives, Employees, Scenarios, Reports, Delivery, Approvals, Org Structure, Jira Settings

**Conditional navigation (feature-flag/permission gated):**

| Item | Gate |
|------|------|
| Org Capacity | `org_capacity_view` flag |
| Flow Forecast | `flow_forecast_v1` flag |
| Job Profiles | `job_profiles` flag |
| Feature Flags | `feature-flag:admin` permission |
| Authorities | `authority:admin` permission |
| Users | `authority:admin` permission |
| RevOps | `authority:admin` permission |

**Keyboard shortcuts (registered via `useKeyboardShortcuts`):**
- `Alt+I` Initiatives, `Alt+C` Employees, `Alt+S` Scenarios, `Alt+R` Reports, `Alt+D` Delivery, `Alt+B` Toggle sidebar

**Breadcrumb component** (internal): Parses `location.pathname` segments and maps them to human-readable labels via a lookup map. UUIDs are displayed as "Details".

---

### ApprovalStatusBanner

**File:** `components/ApprovalStatusBanner.tsx`

Contextual banner showing approval workflow status for a subject (initiative, scenario, or allocation).

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `subjectType` | `'initiative' \| 'scenario' \| 'allocation'` | required | Entity type |
| `subjectId` | `string` | required | Entity UUID |
| `scope` | `ApprovalScope` | required | Approval scope context |
| `advisory` | `boolean` | `false` | If true, uses softer warning colors instead of blocking colors |

**States rendered:**

| Status | Color | Content |
|--------|-------|---------|
| `none` | - | Nothing rendered |
| `pending` | Yellow/Amber | "Approval Pending" with chain preview and level progress |
| `approved` | Green | "Approved" with resolution date |
| `rejected` | Red/Orange | "Approval Rejected" with "Re-request Approval" button |

**Key behaviors:**
- Fetches approval status via `useApprovalStatus` hook
- Chain preview shows each approval level with org node name and approvers
- Re-request button calls `useRequestApproval` mutation
- Advisory mode uses amber/orange instead of yellow/red

---

### CreateInitiativeModal

**File:** `components/CreateInitiativeModal.tsx`

Modal form for creating a new initiative.

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `isOpen` | `boolean` | Controls modal visibility |
| `onClose` | `() => void` | Close handler |

**Form fields:**
- Title (required), Description, Business Owner (required, Select), Product Owner (required, Select), Portfolio Area (Select), Product Leader (Select), Target Quarter (Select)

**Key behaviors:**
- Uses `Modal` component with size `lg`
- Loads users via `useUsers()` and portfolio areas via `usePortfolioAreaNodes()`
- Quarter options from `getQuarterOptions()` helper
- Submit disabled until required fields are filled
- Resets form on close
- Calls `useCreateInitiative()` mutation

---

### CreateIntakeRequestModal

**File:** `components/CreateIntakeRequestModal.tsx`

Modal form for creating an intake request.

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `onClose` | `() => void` | Close handler |
| `prefill` | `{ title?, description?, intakeItemId?, sourceType? }` | Optional pre-filled values (e.g., from Jira) |

**Form fields:**
- Title (required), Description, Requested By (select), Sponsor (select), Portfolio Area (select), Target Quarter, Value Score (1-10), Effort Estimate (XS-XL), Urgency (LOW-CRITICAL), Customer/Stakeholder

**Key behaviors:**
- Custom overlay (not using `Modal` component)
- Pre-fills from `prefill` prop (useful for Jira-sourced items)
- Calls `useCreateIntakeRequest()` mutation
- Closes on backdrop click

---

### ConvertToInitiativeModal

**File:** `components/ConvertToInitiativeModal.tsx`

Modal for converting an intake request into a full initiative.

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `intakeRequest` | `IntakeRequest` | The intake request to convert |
| `onClose` | `() => void` | Close handler |

**Key behaviors:**
- Pre-fills title, description, business owner (from sponsor), product owner (from requester), portfolio area, and target quarter from the intake request
- Shows source info banner with Jira issue key if available
- Info banner explaining what happens on conversion (new Initiative in PROPOSED, intake moves to CONVERTED)
- On success, navigates to the new initiative detail page
- Calls `useConvertToInitiative()` mutation

---

### OrgTreeSelector (TreeNodeItem)

**File:** `components/OrgTreeSelector.tsx`

Recursive tree node component for rendering and selecting from the organizational hierarchy.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `node` | `OrgNode` | required | The org node to render |
| `selectedId` | `string \| null` | required | Currently selected node ID |
| `onSelect` | `(id: string) => void` | required | Selection handler |
| `depth` | `number` | `0` | Indentation depth |
| `showPortfolioAreaBadge` | `boolean` | `false` | Show "PA" badge on portfolio area nodes |

**Key behaviors:**
- Recursive rendering of children
- Expand/collapse toggle (triangle icon); auto-expanded for `depth < 2`
- Indentation via dynamic `paddingLeft` based on depth
- Type badge with color coding per `OrgNodeType` (ROOT=purple, DIVISION=blue, DEPARTMENT=green, TEAM=orange, VIRTUAL=gray, PRODUCT=teal, PLATFORM=cyan, FUNCTIONAL=pink, CHAPTER=rose)
- Abbreviated type label (first 3 chars)
- Membership count shown on the right
- Selected state highlighted with accent background and left border

---

### OriginBadge

**File:** `components/OriginBadge.tsx`

Small badge indicating how an initiative was created.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `origin` | `InitiativeOrigin` | required | One of: `INTAKE_CONVERTED`, `DIRECT_PM`, `LEGACY` |
| `className` | `string` | `''` | Additional CSS classes |

**Origin mapping:**

| Origin | Label | Color | Tooltip |
|--------|-------|-------|---------|
| `INTAKE_CONVERTED` | Intake | Blue | - |
| `DIRECT_PM` | Direct | Amber | - |
| `LEGACY` | Legacy | Gray | "Created before the intake process was introduced..." |

---

## Auth Components (`components/auth/`)

All auth components are re-exported from `components/auth/index.ts`.

---

### LoginPage

**File:** `components/auth/LoginPage.tsx`

Login landing page that auto-redirects to Auth0 Universal Login.

**Props:** None

**Key behaviors:**
- If already authenticated, redirects to `/initiatives`
- Otherwise, calls `loginWithRedirect()` from Auth0 SDK on mount
- Displays ProductFolio branding and a loading spinner while redirecting
- Uses `Navigate` for authenticated redirect

---

### ProtectedRoute

**File:** `components/auth/ProtectedRoute.tsx`

Route guard wrapper that checks authentication and authorization.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `React.ReactNode` | required | Protected content |
| `allowedRoles` | `UserRole[]` | - | Legacy role-based gate |
| `requiredPermissions` | `string[]` | - | Permission-based gate (preferred) |

**Key behaviors:**
- Shows loading spinner while Auth0 is loading or `/auth/me` is resolving
- Redirects to `/login` if not authenticated
- Redirects to `/unauthorized` if required permissions are not met (checks with `some` -- any one permission suffices)
- Falls back to role-based check if `allowedRoles` is provided
- Permission check takes precedence over role check

---

### UserMenu

**File:** `components/auth/UserMenu.tsx`

Avatar button with dropdown menu showing user info and sign-out action.

**Props:** None (reads from `useAuthStore()`)

**Key behaviors:**
- Displays user initials in a circular avatar
- Dropdown shows: full name, email, role badge
- Sign out button calls `useLogout()` hook
- Click-outside and Escape to close
- Focus trap when open
- `role="menu"` with proper ARIA attributes
- Returns `null` if no user is authenticated

**Role labels:** ADMIN, Product Owner, Business Owner, Resource Manager, Viewer

---

## API Client (`api/client.ts`)

**File:** `packages/frontend/src/api/client.ts`

Central HTTP client for all frontend-to-backend communication.

### Configuration

- **Base URL:** `/api` (relative, uses Vite proxy in development)
- **Content-Type:** `application/json` on all requests
- **Authentication:** Bearer token injected via `setTokenProvider()` function

### Token Injection

```ts
import { setTokenProvider } from './api/client';

// Called once during app initialization (in AuthSyncProvider)
setTokenProvider(getAccessTokenSilently);
```

The token provider is called before each request. If token retrieval fails, the request proceeds without authentication (Auth0 SDK handles re-auth).

### Error Handling

```ts
class ApiError extends Error {
  status: number;      // HTTP status code
  statusText: string;  // HTTP status text
  message: string;     // Parsed error message from response body
}
```

Error parsing priority: `response.json().message` > `response.json().error` > `response.statusText` > raw response text.

HTTP 204 responses return `undefined`.

### Exported Methods

```ts
export const api = {
  get:    <T>(endpoint: string) => Promise<T>,
  post:   <T>(endpoint: string, data: unknown) => Promise<T>,
  put:    <T>(endpoint: string, data: unknown) => Promise<T>,
  patch:  <T>(endpoint: string, data: unknown) => Promise<T>,
  delete: <T>(endpoint: string, options?: { data?: unknown }) => Promise<T>,
};
```

All methods are generic -- callers specify the expected response type:

```ts
const initiatives = await api.get<PaginatedResponse<Initiative>>('/initiatives');
const created = await api.post<Initiative>('/initiatives', { title: 'New' });
```

---

## Utilities (`utils/`)

### org-tree.ts

**File:** `packages/frontend/src/utils/org-tree.ts`

Utility for flattening the nested org tree structure.

**Types:**

```ts
interface FlatOrgNode {
  id: string;
  name: string;
  depth: number;
}
```

**Functions:**

#### `flattenOrgTree(nodes: OrgNode[], depth?: number): FlatOrgNode[]`

Recursively flattens a nested `OrgNode[]` tree into a flat array with depth information. Useful for building dropdown/select options from the hierarchical org tree.

```ts
const flat = flattenOrgTree(orgTree);
// [{ id: 'root-id', name: 'Root', depth: 0 }, { id: 'div-id', name: 'Engineering', depth: 1 }, ...]
```
