/**
 * ThemeProvider Component
 *
 * This component wraps the application and provides theme context with
 * localStorage persistence. It sets the `data-theme` attribute on the
 * document root element to activate CSS custom properties.
 *
 * @see src/styles/variables.css for theme variable definitions
 * @see src/lib/theme.tsx for implementation details
 *
 * @example
 * ```tsx
 * // In your app root (e.g., __root.tsx)
 * import { ThemeProvider } from '@/components-v2/ui/ThemeProvider';
 *
 * function App() {
 *   return (
 *     <ThemeProvider>
 *       <YourApp />
 *     </ThemeProvider>
 *   );
 * }
 * ```
 *
 * Features:
 * - SSR-safe initialization (no hydration mismatch)
 * - localStorage persistence (`brain-dump-theme` key)
 * - Automatic `data-theme` attribute updates
 * - Three themes: ember (orange), mint (emerald), solar (gold)
 */

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
