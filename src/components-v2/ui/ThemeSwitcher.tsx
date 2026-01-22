import { useTheme, DARK_THEMES, LIGHT_THEMES, type Theme } from "../../lib/theme";

export interface ThemeSwitcherProps {
  /** Additional CSS class names */
  className?: string;
}

/**
 * Theme metadata for rendering the theme cards.
 * Each theme has a display name, two preview colors, background color, and aria description.
 */
const THEME_CONFIG: Record<
  Theme,
  {
    name: string;
    primaryColor: string;
    secondaryColor: string;
    bgColor: string;
    description: string;
  }
> = {
  // Dark themes
  ember: {
    name: "Ember",
    primaryColor: "#f97316",
    secondaryColor: "#14b8a6",
    bgColor: "#0a0a0a",
    description: "Orange and teal on dark",
  },
  mint: {
    name: "Mint",
    primaryColor: "#10b981",
    secondaryColor: "#f43f5e",
    bgColor: "#0a0a0a",
    description: "Emerald and rose on dark",
  },
  solar: {
    name: "Solar",
    primaryColor: "#eab308",
    secondaryColor: "#3b82f6",
    bgColor: "#0a0a0a",
    description: "Gold and blue on dark",
  },
  arctic: {
    name: "Arctic",
    primaryColor: "#0ea5e9",
    secondaryColor: "#a855f7",
    bgColor: "#0a0a0a",
    description: "Ice blue and violet on dark",
  },
  neon: {
    name: "Neon",
    primaryColor: "#8b5cf6",
    secondaryColor: "#06b6d4",
    bgColor: "#0a0a0a",
    description: "Violet and cyan on dark",
  },
  blush: {
    name: "Blush",
    primaryColor: "#ec4899",
    secondaryColor: "#14b8a6",
    bgColor: "#0a0a0a",
    description: "Pink and teal on dark",
  },
  // Light themes
  daylight: {
    name: "Daylight",
    primaryColor: "#ea580c",
    secondaryColor: "#0d9488",
    bgColor: "#fafaf9",
    description: "Orange on warm white",
  },
  frost: {
    name: "Frost",
    primaryColor: "#0284c7",
    secondaryColor: "#7c3aed",
    bgColor: "#f8fafc",
    description: "Blue on cool white",
  },
  paper: {
    name: "Paper",
    primaryColor: "#7c3aed",
    secondaryColor: "#0891b2",
    bgColor: "#fafafa",
    description: "Violet on neutral white",
  },
};

/**
 * ThemeCard - Individual theme selection card with preview.
 *
 * Shows background color preview with accent color dots.
 */
function ThemeCard({
  theme,
  isActive,
  onSelect,
}: {
  theme: Theme;
  isActive: boolean;
  onSelect: () => void;
}) {
  const config = THEME_CONFIG[theme];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      aria-label={`${config.name} theme${isActive ? " (active)" : ""}`}
      onClick={onSelect}
      className={`
        flex flex-col items-center gap-1.5 p-2 min-w-[60px]
        rounded-lg transition-all duration-200
        ${
          isActive
            ? "ring-2 ring-[var(--accent-primary)] ring-offset-1 ring-offset-[var(--bg-secondary)]"
            : "hover:bg-[var(--bg-hover)]"
        }
      `}
    >
      {/* Preview box with bg color and accent dots */}
      <div
        className="w-12 h-8 rounded-md flex items-center justify-center gap-1 border border-[var(--border-primary)]"
        style={{ backgroundColor: config.bgColor }}
      >
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: config.primaryColor }}
          aria-hidden="true"
        />
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: config.secondaryColor }}
          aria-hidden="true"
        />
      </div>

      {/* Theme name */}
      <span
        className={`text-[10px] font-medium ${
          isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}
      >
        {config.name}
      </span>
    </button>
  );
}

/**
 * Theme switcher component with visual theme cards.
 *
 * Displays themes organized by dark and light categories.
 */
export function ThemeSwitcher({ className = "" }: ThemeSwitcherProps) {
  const { theme: currentTheme, setTheme } = useTheme();

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Dark themes */}
      <div>
        <div className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
          Dark
        </div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Dark themes">
          {DARK_THEMES.map((theme) => (
            <ThemeCard
              key={theme}
              theme={theme}
              isActive={theme === currentTheme}
              onSelect={() => setTheme(theme)}
            />
          ))}
        </div>
      </div>

      {/* Light themes */}
      <div>
        <div className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
          Light
        </div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Light themes">
          {LIGHT_THEMES.map((theme) => (
            <ThemeCard
              key={theme}
              theme={theme}
              isActive={theme === currentTheme}
              onSelect={() => setTheme(theme)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ThemeSwitcher;
