// src/hooks/useTheme.ts
import { useThemeContext } from '../context/ThemeContext';

export function useTheme() {
  return useThemeContext();
}

export default useTheme;
