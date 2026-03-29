import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

/**
 * Available theme options.
 *
 * Dark themes:
 * - slate: Neutral charcoal (default) — professional, no colored accent
 * - arctic: Cool blue-tinted — like deep polar ice
 * - neon: Electric purple — cyberpunk lab
 * - mint: Forest green-tinted — organic workshop
 * - blush: Rose-tinted — modern studio
 * - oxide: Warm copper-red — bold and distinctive
 *
 * Light themes:
 * - daylight: Warm cream + terracotta
 * - frost: Cool slate + deep indigo
 * - paper: Neutral + ink/charcoal
 */
export type Theme =
  | "slate"
  | "arctic"
  | "neon"
  | "mint"
  | "blush"
  | "oxide"
  | "ember"
  | "solar"
  | "daylight"
  | "frost"
  | "paper";

/**
 * Theme context value returned by useTheme hook.
 */
export interface ThemeContextValue {
  /** Current active theme */
  theme: Theme;
  /** Update the theme (persists to localStorage) */
  setTheme: (theme: Theme) => void;
}

/** localStorage key for theme persistence */
export const THEME_STORAGE_KEY = "brain-dump-theme";

/** Default theme when no preference is stored */
export const DEFAULT_THEME: Theme = "slate";

/** All valid theme values for validation */
export const THEMES: readonly Theme[] = [
  // Dark themes
  "slate",
  "arctic",
  "neon",
  "mint",
  "blush",
  "oxide",
  // Legacy (hidden from picker, still valid for existing users)
  "ember",
  "solar",
  // Light themes
  "daylight",
  "frost",
  "paper",
] as const;

/** Dark themes shown in theme picker */
export const DARK_THEMES: readonly Theme[] = [
  "slate",
  "arctic",
  "neon",
  "mint",
  "blush",
  "oxide",
] as const;

/** Light themes */
export const LIGHT_THEMES: readonly Theme[] = ["daylight", "frost", "paper"] as const;

/** Check if a theme is a light theme */
export function isLightTheme(theme: Theme): boolean {
  return LIGHT_THEMES.includes(theme);
}

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
  } catch (error) {
    // localStorage can throw in certain environments (e.g., private browsing)
    if (process.env.NODE_ENV === "development") {
      console.warn("[ThemeProvider] Failed to read from localStorage:", error);
    }
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
  } catch (error) {
    // Silently fail if localStorage is unavailable
    if (process.env.NODE_ENV === "development") {
      console.warn("[ThemeProvider] Failed to write to localStorage:", error);
    }
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

/**
 * React context for theme state.
 * Default value is undefined to detect missing provider.
 */
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

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
  // Use lazy initializer to get the initial theme value.
  // On client: reads the data-theme attribute (set by blocking script in <head>)
  // which avoids hydration mismatch since both server and client start with the
  // same DOM state. Falls back to localStorage then default.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (initialTheme) {
      return initialTheme;
    }
    // Read from DOM attribute first (set by blocking script before hydration)
    if (typeof document !== "undefined") {
      const domTheme = document.documentElement.getAttribute("data-theme");
      if (domTheme && isValidTheme(domTheme)) {
        return domTheme;
      }
    }
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

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

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
