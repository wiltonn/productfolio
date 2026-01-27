import { useState, useEffect, useCallback, useId } from 'react';
import { announceToScreenReader } from '../../lib/accessibility';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  label?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 200,
  className = '',
  label,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const inputId = useId();
  const labelId = useId();

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
        // Announce search results to screen readers after debounce
        if (localValue) {
          announceToScreenReader(`Searching for ${localValue}`, 'polite');
        }
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onChange, value]);

  const handleClear = useCallback(() => {
    setLocalValue('');
    onChange('');
    announceToScreenReader('Search cleared', 'polite');
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && localValue) {
      handleClear();
    }
  };

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label id={labelId} htmlFor={inputId} className="block text-xs font-medium text-surface-500 mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          id={inputId}
          type="search"
          role="searchbox"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel || label}
          aria-labelledby={label ? labelId : undefined}
          aria-describedby={ariaDescribedby}
          className={`
            w-full pl-9 pr-8 py-2 text-sm bg-white border border-surface-300 rounded-md
            placeholder:text-surface-400
            hover:border-surface-400
            focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent
            transition-all duration-150
          `}
        />
        {localValue && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
