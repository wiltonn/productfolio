import { useState, useRef, useEffect, useCallback } from 'react';
import type { SelectOption } from './MultiSelect';

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  allowClear?: boolean;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  className = '',
  allowClear = true,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  const selectedOption = options.find((o) => o.value === value);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-surface-500 mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between gap-2 px-3 py-2 text-sm
          bg-white border rounded-md transition-all duration-150
          ${isOpen ? 'border-accent-500 ring-2 ring-accent-500/20' : 'border-surface-300 hover:border-surface-400'}
        `}
      >
        <span className={`truncate ${!selectedOption ? 'text-surface-400' : 'text-surface-800'}`}>
          {selectedOption?.label || placeholder}
        </span>
        <div className="flex items-center gap-1">
          {allowClear && value && (
            <span
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg
            className={`w-4 h-4 text-surface-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full bg-white border border-surface-200 rounded-lg shadow-elevated overflow-hidden animate-slide-up">
          <div className="max-h-60 overflow-auto py-1">
            {options.map((option) => {
              const isSelected = value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 text-sm text-left
                    transition-colors duration-100
                    ${isSelected ? 'bg-accent-50 text-accent-800' : 'text-surface-700 hover:bg-surface-50'}
                  `}
                >
                  {option.color && (
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: option.color }}
                    />
                  )}
                  <span className="truncate">{option.label}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 ml-auto text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
