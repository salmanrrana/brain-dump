// Re-export ThemeProvider and related exports from the central theme module
export {
  ThemeProvider,
  useTheme,
  type ThemeProviderProps,
  type ThemeContextValue,
  type Theme,
  // Constants for consumers who need them
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  THEMES,
} from "../../lib/theme";
