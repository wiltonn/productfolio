import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '../../tests/test-utils';
import { BulkActionsBar } from './BulkActionsBar';

describe('BulkActionsBar', () => {
  const mockActions = [
    { label: 'Delete', onClick: vi.fn(), variant: 'danger' as const },
    { label: 'Archive', onClick: vi.fn() },
    { label: 'Export', onClick: vi.fn() },
  ];

  it('should render when items are selected', () => {
    render(<BulkActionsBar selectedCount={3} actions={mockActions} onClearSelection={vi.fn()} />);

    expect(screen.getByText('3 items selected')).toBeInTheDocument();
  });

  it('should not render when no items selected', () => {
    const { container } = render(
      <BulkActionsBar selectedCount={0} actions={mockActions} onClearSelection={vi.fn()} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render all action buttons', () => {
    render(<BulkActionsBar selectedCount={2} actions={mockActions} onClearSelection={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('should call action onClick when button clicked', async () => {
    const user = userEvent.setup();
    const deleteAction = { label: 'Delete', onClick: vi.fn() };

    render(
      <BulkActionsBar
        selectedCount={2}
        actions={[deleteAction]}
        onClearSelection={vi.fn()}
      />
    );

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteButton);

    expect(deleteAction.onClick).toHaveBeenCalledTimes(1);
  });

  it('should call onClearSelection when clear button clicked', async () => {
    const user = userEvent.setup();
    const handleClear = vi.fn();

    render(
      <BulkActionsBar
        selectedCount={5}
        actions={mockActions}
        onClearSelection={handleClear}
      />
    );

    const clearButton = screen.getByRole('button', { name: /clear|deselect/i });
    await user.click(clearButton);

    expect(handleClear).toHaveBeenCalledTimes(1);
  });

  it('should display correct count for single item', () => {
    render(<BulkActionsBar selectedCount={1} actions={mockActions} onClearSelection={vi.fn()} />);

    expect(screen.getByText('1 item selected')).toBeInTheDocument();
  });

  it('should display correct count for multiple items', () => {
    render(<BulkActionsBar selectedCount={10} actions={mockActions} onClearSelection={vi.fn()} />);

    expect(screen.getByText('10 items selected')).toBeInTheDocument();
  });

  it('should apply danger variant styling', () => {
    render(<BulkActionsBar selectedCount={2} actions={mockActions} onClearSelection={vi.fn()} />);

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toHaveClass('bg-red-600');
  });

  it('should handle empty actions array', () => {
    render(<BulkActionsBar selectedCount={3} actions={[]} onClearSelection={vi.fn()} />);

    expect(screen.getByText('3 items selected')).toBeInTheDocument();
    // Only clear button should be present
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('should disable actions when loading', () => {
    render(
      <BulkActionsBar
        selectedCount={2}
        actions={mockActions}
        onClearSelection={vi.fn()}
        isLoading
      />
    );

    mockActions.forEach((action) => {
      const button = screen.getByRole('button', { name: action.label });
      expect(button).toBeDisabled();
    });
  });
});
