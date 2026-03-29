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
    bgColor: "#050507",
    description: "Cool midnight + warm orange",
  },
  mint: {
    name: "Mint",
    primaryColor: "#10b981",
    secondaryColor: "#f43f5e",
    bgColor: "#040806",
    description: "Forest workshop",
  },
  solar: {
    name: "Solar",
    primaryColor: "#eab308",
    secondaryColor: "#3b82f6",
    bgColor: "#070604",
    description: "Warm terminal glow",
  },
  arctic: {
    name: "Arctic",
    primaryColor: "#38bdf8",
    secondaryColor: "#a78bfa",
    bgColor: "#040608",
    description: "Deep polar ice",
  },
  neon: {
    name: "Neon",
    primaryColor: "#a78bfa",
    secondaryColor: "#22d3ee",
    bgColor: "#06040a",
    description: "Cyberpunk lab",
  },
  blush: {
    name: "Blush",
    primaryColor: "#f472b6",
    secondaryColor: "#2dd4bf",
    bgColor: "#080506",
    description: "Rose studio",
  },
  // Light themes
  daylight: {
    name: "Daylight",
    primaryColor: "#c2410c",
    secondaryColor: "#0f766e",
    bgColor: "#faf8f5",
    description: "Terracotta on warm cream",
  },
  frost: {
    name: "Frost",
    primaryColor: "#4338ca",
    secondaryColor: "#0891b2",
    bgColor: "#f8f9fb",
    description: "Indigo on cool slate",
  },
  paper: {
    name: "Paper",
    primaryColor: "#171717",
    secondaryColor: "#0284c7",
    bgColor: "#fafafa",
    description: "Ink on neutral white",
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
