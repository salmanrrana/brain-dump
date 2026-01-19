/**
 * Theme Context and Hook for Brain Dump
 *
 * Provides theme management with localStorage persistence and SSR safety.
 * The theme system uses CSS custom properties via data-theme attributes
 * defined in src/styles/variables.css.
 *
 * @example
 * ```tsx
 * // In your app root
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 *
 * // In any component
 * const { theme, setTheme } = useTheme();
 * ```
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Available theme options.
 * - ember: Orange accent (default)
 * - mint: Emerald/green accent
 * - solar: Gold/yellow accent
 */
export type Theme = "ember" | "mint" | "solar";

/**
 * Theme context value returned by useTheme hook.
 */
export interface ThemeContextValue {
  /** Current active theme */
  theme: Theme;
  /** Update the theme (persists to localStorage) */
  setTheme: (theme: Theme) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** localStorage key for theme persistence */
export const THEME_STORAGE_KEY = "brain-dump-theme";

/** Default theme when no preference is stored */
export const DEFAULT_THEME: Theme = "ember";

/** All valid theme values for validation */
export const THEMES: readonly Theme[] = ["ember", "mint", "solar"] as const;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Validates that a value is a valid Theme.
 * Returns the validated theme or the default if invalid.
 */
export function isValidTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.includes(value as Theme);
}

/**
 * Gets the stored theme from localStorage.
 * Returns null on server or if no theme is stored.
 *
 * @returns The stored theme or null
 */
export function getStoredTheme(): Theme | null {
  // SSR safety: check for window/localStorage
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && isValidTheme(stored)) {
      return stored;
    }
    return null;
  } catch {
    // localStorage can throw in certain environments (e.g., private browsing)
    return null;
  }
}

/**
 * Saves the theme to localStorage.
 * No-op on server or if localStorage is unavailable.
 *
 * @param theme - The theme to save
 */
export function saveTheme(theme: Theme): void {
  // SSR safety: check for window/localStorage
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Applies the theme to the document root element.
 * Sets the data-theme attribute which activates the corresponding CSS variables.
 *
 * @param theme - The theme to apply
 */
export function applyTheme(theme: Theme): void {
  // SSR safety: check for document
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.setAttribute("data-theme", theme);
}

// =============================================================================
// CONTEXT
// =============================================================================

/**
 * React context for theme state.
 * Default value is undefined to detect missing provider.
 */
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// =============================================================================
// PROVIDER
// =============================================================================

export interface ThemeProviderProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Initial theme (overrides localStorage, useful for testing) */
  initialTheme?: Theme;
}

/**
 * Theme provider component that manages theme state and persistence.
 *
 * Features:
 * - SSR-safe initialization (no hydration mismatch)
 * - localStorage persistence
 * - Automatic document attribute updates
 *
 * @example
 * ```tsx
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 *
 * // With initial theme override (e.g., for testing)
 * <ThemeProvider initialTheme="mint">
 *   <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  // Use lazy initializer to get the initial theme value
  // On server: returns default theme
  // On client: returns stored theme or default (avoids double render)
  const [theme, setThemeState] = useState<Theme>(() => {
    // If initialTheme prop is provided (testing mode), use it
    if (initialTheme) {
      return initialTheme;
    }
    // Try to get stored theme (returns null on server)
    const stored = getStoredTheme();
    return stored ?? DEFAULT_THEME;
  });

  // Apply theme to document on mount and when theme changes
  // This effect syncs React state to the DOM (external system) - the proper use of effects
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Memoized setTheme that also persists to localStorage
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    saveTheme(newTheme);
    // Note: applyTheme is called in the effect above when theme changes
  }, []);

  const value: ThemeContextValue = {
    theme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook to access theme context.
 *
 * Must be used within a ThemeProvider.
 *
 * @returns Theme context value with current theme and setter
 * @throws Error if used outside of ThemeProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { theme, setTheme } = useTheme();
 *
 *   return (
 *     <button onClick={() => setTheme('mint')}>
 *       Current theme: {theme}
 *     </button>
 *   );
 * }
 * ```
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
