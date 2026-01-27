import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '../../tests/test-utils';
import { SearchInput } from './SearchInput';

describe('SearchInput', () => {
  it('should render with placeholder', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Search initiatives..." />);
    expect(screen.getByPlaceholderText('Search initiatives...')).toBeInTheDocument();
  });

  it('should display current value', () => {
    render(<SearchInput value="test query" onChange={vi.fn()} />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    expect(input.value).toBe('test query');
  });

  it('should call onChange when typing', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<SearchInput value="" onChange={handleChange} />);

    const input = screen.getByRole('searchbox');
    await user.type(input, 'test');

    expect(handleChange).toHaveBeenCalledTimes(4); // Once per character
    expect(handleChange).toHaveBeenLastCalledWith('test');
  });

  it('should clear input when clear button is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<SearchInput value="test" onChange={handleChange} />);

    const clearButton = screen.getByRole('button', { name: /clear/i });
    await user.click(clearButton);

    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('should not show clear button when value is empty', () => {
    render(<SearchInput value="" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  it('should show clear button when value is present', () => {
    render(<SearchInput value="test" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<SearchInput value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('searchbox')).toBeDisabled();
  });

  it('should handle rapid input changes', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<SearchInput value="" onChange={handleChange} />);

    const input = screen.getByRole('searchbox');
    await user.type(input, 'quick');

    expect(handleChange).toHaveBeenCalled();
    expect(handleChange.mock.calls[handleChange.mock.calls.length - 1][0]).toBe('quick');
  });
});
