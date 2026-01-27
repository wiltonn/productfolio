import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '../../tests/test-utils';
import { Select } from './Select';

describe('Select', () => {
  const options = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' },
  ];

  it('should render with label', () => {
    render(<Select label="Test Select" options={options} value="" onChange={vi.fn()} />);
    expect(screen.getByText('Test Select')).toBeInTheDocument();
  });

  it('should render all options', () => {
    render(<Select options={options} value="" onChange={vi.fn()} />);

    options.forEach((option) => {
      expect(screen.getByText(option.label)).toBeInTheDocument();
    });
  });

  it('should display selected value', () => {
    render(<Select options={options} value="option2" onChange={vi.fn()} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('option2');
  });

  it('should call onChange when selection changes', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<Select options={options} value="option1" onChange={handleChange} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'option2');

    expect(handleChange).toHaveBeenCalledWith('option2');
  });

  it('should render with placeholder', () => {
    render(
      <Select
        options={options}
        value=""
        onChange={vi.fn()}
        placeholder="Select an option"
      />
    );

    expect(screen.getByText('Select an option')).toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Select options={options} value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('should handle empty options array', () => {
    render(<Select options={[]} value="" onChange={vi.fn()} placeholder="No options" />);
    expect(screen.getByText('No options')).toBeInTheDocument();
  });

  it('should show error state when error prop is provided', () => {
    render(
      <Select
        options={options}
        value=""
        onChange={vi.fn()}
        error="This field is required"
      />
    );

    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('should apply required attribute when required', () => {
    render(<Select options={options} value="" onChange={vi.fn()} required />);
    expect(screen.getByRole('combobox')).toHaveAttribute('required');
  });
});
