import { useTheme, THEMES, type Theme } from "../../lib/theme";

export interface ThemeSwitcherProps {
  /** Additional CSS class names */
  className?: string;
}

/**
 * Theme metadata for rendering the theme cards.
 * Each theme has a display name, two preview colors, and aria description.
 * The dual colors represent the theme's visual palette.
 */
const THEME_CONFIG: Record<
  Theme,
  { name: string; primaryColor: string; secondaryColor: string; description: string }
> = {
  ember: {
    name: "Ember",
    primaryColor: "#f97316", // orange-500
    secondaryColor: "#14b8a6", // teal-500 (AI accent)
    description: "Orange and teal accent theme",
  },
  mint: {
    name: "Mint",
    primaryColor: "#10b981", // emerald-500
    secondaryColor: "#ec4899", // pink-500
    description: "Emerald and pink accent theme",
  },
  solar: {
    name: "Solar",
    primaryColor: "#eab308", // yellow-500
    secondaryColor: "#3b82f6", // blue-500
    description: "Gold and blue accent theme",
  },
};

/**
 * ThemeCard - Individual theme selection card with dual-color preview.
 *
 * Displays two color dots representing the theme's palette
 * with the theme name below. Selected state shows a highlighted border.
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
        flex flex-col items-center gap-2 p-3
        rounded-xl border-2 transition-all duration-150
        ${
          isActive
            ? "border-[var(--accent-primary)] bg-[var(--accent-muted)]"
            : "border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]"
        }
      `}
    >
      {/* Dual color dots */}
      <div className="flex items-center gap-1.5">
        <span
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: config.primaryColor }}
          aria-hidden="true"
        />
        <span
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: config.secondaryColor }}
          aria-hidden="true"
        />
      </div>

      {/* Theme name */}
      <span
        className={`text-xs font-medium ${
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
 * Displays three theme options (Ember, Mint, Solar) as cards,
 * each showing a dual-color preview and theme name.
 * The selected theme has a highlighted border.
 */
export function ThemeSwitcher({ className = "" }: ThemeSwitcherProps) {
  const { theme: currentTheme, setTheme } = useTheme();

  return (
    <div
      className={`flex items-center gap-3 ${className}`}
      role="radiogroup"
      aria-label="Theme selector"
    >
      {THEMES.map((theme) => (
        <ThemeCard
          key={theme}
          theme={theme}
          isActive={theme === currentTheme}
          onSelect={() => setTheme(theme)}
        />
      ))}
    </div>
  );
}

export default ThemeSwitcher;
