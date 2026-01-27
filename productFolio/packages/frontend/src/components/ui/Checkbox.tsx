import { forwardRef, type ComponentPropsWithoutRef } from 'react';

interface CheckboxProps extends Omit<ComponentPropsWithoutRef<'input'>, 'type'> {
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', indeterminate = false, checked, ...props }, ref) => {
    return (
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          ref={(el) => {
            if (el) {
              el.indeterminate = indeterminate;
            }
            if (typeof ref === 'function') {
              ref(el);
            } else if (ref) {
              ref.current = el;
            }
          }}
          checked={checked}
          className={`
            peer appearance-none w-4 h-4 border border-surface-300 rounded
            bg-white transition-all duration-150 cursor-pointer
            hover:border-surface-400
            checked:bg-accent-600 checked:border-accent-600
            checked:hover:bg-accent-700 checked:hover:border-accent-700
            focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:ring-offset-1
            disabled:opacity-50 disabled:cursor-not-allowed
            ${indeterminate ? 'bg-accent-600 border-accent-600' : ''}
            ${className}
          `}
          {...props}
        />
        {/* Check icon */}
        <svg
          className={`
            absolute w-3 h-3 text-white pointer-events-none
            transition-all duration-100
            ${checked && !indeterminate ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
          `}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {/* Indeterminate icon */}
        <svg
          className={`
            absolute w-3 h-3 text-white pointer-events-none
            transition-all duration-100
            ${indeterminate ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
          `}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
