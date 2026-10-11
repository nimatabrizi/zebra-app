'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
};

export default function ThemeToggle({
  className = '',
  compact = false,
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Aydınlık temaya geç' : 'Karanlık temaya geç'}
      title={isDark ? 'Aydınlık tema' : 'Karanlık tema'}
      className={`group relative inline-flex items-center justify-center rounded-full border border-[var(--z-border)] bg-[var(--z-elevated)] text-[var(--z-muted)] transition-all duration-300 ease-zebra hover:border-[var(--z-border-strong)] hover:text-[var(--z-fg)] active:scale-95 cursor-pointer ${
        compact ? 'h-9 w-9' : 'h-10 w-10'
      } ${className}`}
    >
      <Sun
        className={`absolute h-[15px] w-[15px] transition-all duration-400 ease-zebra ${
          isDark
            ? 'scale-75 rotate-90 opacity-0'
            : 'scale-100 rotate-0 opacity-100'
        }`}
        strokeWidth={2}
      />
      <Moon
        className={`absolute h-[15px] w-[15px] transition-all duration-400 ease-zebra ${
          isDark
            ? 'scale-100 rotate-0 opacity-100'
            : 'scale-75 -rotate-90 opacity-0'
        }`}
        strokeWidth={2}
      />
    </button>
  );
}
