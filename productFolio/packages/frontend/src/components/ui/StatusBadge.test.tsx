import { describe, it, expect } from 'vitest';
import { render, screen } from '../../tests/test-utils';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('should render draft status', () => {
    render(<StatusBadge status="DRAFT" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('should render pending approval status', () => {
    render(<StatusBadge status="PENDING_APPROVAL" />);
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
  });

  it('should render approved status', () => {
    render(<StatusBadge status="APPROVED" />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('should render in progress status', () => {
    render(<StatusBadge status="IN_PROGRESS" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('should render completed status', () => {
    render(<StatusBadge status="COMPLETED" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
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
    const { rerender } = render(<StatusBadge status="DRAFT" />);
    expect(screen.getByText('Draft')).toHaveClass('bg-gray-100');

    rerender(<StatusBadge status="APPROVED" />);
    expect(screen.getByText('Approved')).toHaveClass('bg-green-100');

    rerender(<StatusBadge status="COMPLETED" />);
    expect(screen.getByText('Completed')).toHaveClass('bg-blue-100');

    rerender(<StatusBadge status="CANCELLED" />);
    expect(screen.getByText('Cancelled')).toHaveClass('bg-red-100');
  });
});
