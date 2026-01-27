import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '../../tests/test-utils';
import { MultiSelect } from './MultiSelect';

describe('MultiSelect', () => {
  const options = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' },
  ];

  it('should render with label', () => {
    render(<MultiSelect label="Test Multi Select" options={options} value={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Test Multi Select')).toBeInTheDocument();
  });

  it('should display selected values as tags', () => {
    render(
      <MultiSelect
        options={options}
        value={['option1', 'option2']}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
  });

  it('should open dropdown when clicked', async () => {
    const user = userEvent.setup();

    render(<MultiSelect options={options} value={[]} onChange={vi.fn()} />);

    const button = screen.getByRole('button');
    await user.click(button);

    // Dropdown should be visible
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.getByText('Option 3')).toBeInTheDocument();
  });

  it('should add option when clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<MultiSelect options={options} value={[]} onChange={handleChange} />);

    const button = screen.getByRole('button');
    await user.click(button);

    const option1 = screen.getByText('Option 1');
    await user.click(option1);

    expect(handleChange).toHaveBeenCalledWith(['option1']);
  });

  it('should remove option when tag close is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <MultiSelect
        options={options}
        value={['option1', 'option2']}
        onChange={handleChange}
      />
    );

    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await user.click(removeButtons[0]);

    expect(handleChange).toHaveBeenCalledWith(['option2']);
  });

  it('should toggle selection when option clicked multiple times', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<MultiSelect options={options} value={['option1']} onChange={handleChange} />);

    const button = screen.getByRole('button');
    await user.click(button);

    const option1 = screen.getByText('Option 1');
    await user.click(option1);

    // Should remove option1
    expect(handleChange).toHaveBeenCalledWith([]);
  });

  it('should show placeholder when no values selected', () => {
    render(
      <MultiSelect
        options={options}
        value={[]}
        onChange={vi.fn()}
        placeholder="Select options..."
      />
    );

    expect(screen.getByText('Select options...')).toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<MultiSelect options={options} value={[]} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should handle selecting all options', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<MultiSelect options={options} value={[]} onChange={handleChange} />);

    const button = screen.getByRole('button');
    await user.click(button);

    // Click all options
    for (const option of options) {
      const optionElement = screen.getByText(option.label);
      await user.click(optionElement);
    }

    // Should have been called for each selection
    expect(handleChange).toHaveBeenCalledTimes(3);
  });

  it('should handle empty options array', () => {
    render(<MultiSelect options={[]} value={[]} onChange={vi.fn()} />);

    // Should still render but with no options
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });
});
