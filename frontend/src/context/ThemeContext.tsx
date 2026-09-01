// src/context/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Theme } from '../types';

const STORAGE_KEY = 'docshield-theme';

interface ThemeContextType {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      const root = document.documentElement;
      root.classList.remove('dark', 'light');
      root.classList.add(theme);
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      console.error('Failed to sync theme to root element', e);
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useThemeContext(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback if accessed outside provider
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : 'dark';
    const active = stored === 'light' || document.documentElement.classList.contains('light') ? 'light' : 'dark';
    return {
      theme: active as Theme,
      toggle: () => {},
      setTheme: () => {},
    };
  }
  return ctx;
}
