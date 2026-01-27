import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { announceToScreenReader } from '../../lib/accessibility';

export interface SelectOption {
  value: string;
  label: string;
  color?: string;
}

interface MultiSelectProps {
  options: SelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  'aria-describedby'?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  className = '',
  disabled = false,
  'aria-describedby': ariaDescribedby,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    returnFocusElement: buttonRef.current,
    focusFirstElement: false,
  });

  const labelId = useId();
  const listboxId = useId();

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  const toggleOption = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange(newValue);

    const option = options.find((o) => o.value === optionValue);
    const isAdding = !value.includes(optionValue);
    if (option) {
      announceToScreenReader(`${option.label} ${isAdding ? 'selected' : 'deselected'}. ${newValue.length} items selected.`);
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
    announceToScreenReader('All selections cleared');
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0) {
          toggleOption(options[highlightedIndex].value);
        } else {
          setIsOpen(!isOpen);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setHighlightedIndex(0);
        } else {
          setHighlightedIndex((prev) => Math.min(prev + 1, options.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setHighlightedIndex(options.length - 1);
        } else {
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        }
        break;
      case 'Home':
        if (isOpen) {
          e.preventDefault();
          setHighlightedIndex(0);
        }
        break;
      case 'End':
        if (isOpen) {
          e.preventDefault();
          setHighlightedIndex(options.length - 1);
        }
        break;
    }
  };

  const selectedLabels = value
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label id={labelId} className="block text-xs font-medium text-surface-500 mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={label ? labelId : undefined}
        aria-label={!label ? placeholder : undefined}
        aria-describedby={ariaDescribedby}
        className={`
          w-full flex items-center justify-between gap-2 px-3 py-2 text-sm
          bg-white border rounded-md transition-all duration-150
          ${isOpen ? 'border-accent-500 ring-2 ring-accent-500/20' : 'border-surface-300 hover:border-surface-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <span className={`truncate ${value.length === 0 ? 'text-surface-400' : 'text-surface-800'}`}>
          {value.length === 0
            ? placeholder
            : value.length === 1
            ? selectedLabels[0]
            : `${value.length} selected`}
        </span>
        <div className="flex items-center gap-1">
          {value.length > 0 && !disabled && (
            <button
              type="button"
              onClick={clearAll}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  clearAll(e as any);
                }
              }}
              aria-label="Clear all selections"
              className="p-0.5 rounded hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <svg
            className={`w-4 h-4 text-surface-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          role="listbox"
          id={listboxId}
          aria-labelledby={label ? labelId : undefined}
          aria-multiselectable="true"
          className="absolute z-50 mt-1.5 w-full bg-white border border-surface-200 rounded-lg shadow-elevated overflow-hidden animate-slide-up"
        >
          <div className="max-h-60 overflow-auto py-1">
            {options.map((option, index) => {
              const isSelected = value.includes(option.value);
              const isHighlighted = index === highlightedIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggleOption(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 text-sm text-left
                    transition-colors duration-100
                    ${isSelected ? 'bg-accent-50 text-accent-800' : isHighlighted ? 'bg-surface-100 text-surface-900' : 'text-surface-700 hover:bg-surface-50'}
                  `}
                >
                  <span
                    className={`
                      flex-shrink-0 w-4 h-4 border rounded flex items-center justify-center
                      transition-all duration-150
                      ${isSelected ? 'bg-accent-600 border-accent-600' : 'border-surface-300'}
                    `}
                    aria-hidden="true"
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  {option.color && (
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: option.color }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
