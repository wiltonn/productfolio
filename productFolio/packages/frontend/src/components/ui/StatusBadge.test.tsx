import { describe, it, expect } from 'vitest';
import { render, screen } from '../../tests/test-utils';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('should render proposed status', () => {
    render(<StatusBadge status="PROPOSED" />);
    expect(screen.getByText('Proposed')).toBeInTheDocument();
  });

  it('should render scoping status', () => {
    render(<StatusBadge status="SCOPING" />);
    expect(screen.getByText('Scoping')).toBeInTheDocument();
  });

  it('should render resourcing status', () => {
    render(<StatusBadge status="RESOURCING" />);
    expect(screen.getByText('Resourcing')).toBeInTheDocument();
  });

  it('should render in execution status', () => {
    render(<StatusBadge status="IN_EXECUTION" />);
    expect(screen.getByText('In Execution')).toBeInTheDocument();
  });

  it('should render complete status', () => {
    render(<StatusBadge status="COMPLETE" />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('should render on hold status', () => {
    render(<StatusBadge status="ON_HOLD" />);
    expect(screen.getByText('On Hold')).toBeInTheDocument();
  });

  it('should render cancelled status', () => {
    render(<StatusBadge status="CANCELLED" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('should apply correct CSS classes for different statuses', () => {
    const { rerender } = render(<StatusBadge status="PROPOSED" />);
    expect(screen.getByText('Proposed')).toHaveClass('bg-surface-100');

    rerender(<StatusBadge status="RESOURCING" />);
    expect(screen.getByText('Resourcing')).toHaveClass('bg-sky-50');

    rerender(<StatusBadge status="COMPLETE" />);
    expect(screen.getByText('Complete')).toHaveClass('bg-violet-50');

    rerender(<StatusBadge status="CANCELLED" />);
    expect(screen.getByText('Cancelled')).toHaveClass('bg-red-50');
  });
});
