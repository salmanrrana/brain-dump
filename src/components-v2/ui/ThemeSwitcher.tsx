import { useTheme, THEMES, type Theme } from "../../lib/theme";

export interface ThemeSwitcherProps {
  /** Additional CSS class names */
  className?: string;
}

/**
 * Theme metadata for rendering the switcher buttons.
 * Each theme has a display name, primary color for the dot, and aria description.
 */
const THEME_CONFIG: Record<Theme, { name: string; color: string; description: string }> = {
  ember: {
    name: "Ember",
    color: "#f97316", // orange-500
    description: "Orange accent theme",
  },
  mint: {
    name: "Mint",
    color: "#10b981", // emerald-500
    description: "Emerald green accent theme",
  },
  solar: {
    name: "Solar",
    color: "#eab308", // yellow-500
    description: "Gold accent theme",
  },
};

/**
 * Theme switcher component with 3 color dot buttons.
 *
 * Each button represents a theme and clicking it changes the active theme.
 * The current theme is indicated with a glowing ring effect.
 */
export function ThemeSwitcher({ className = "" }: ThemeSwitcherProps) {
  const { theme: currentTheme, setTheme } = useTheme();

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      role="radiogroup"
      aria-label="Theme selector"
    >
      {THEMES.map((theme) => {
        const config = THEME_CONFIG[theme];
        const isActive = theme === currentTheme;

        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`${config.name} theme${isActive ? " (active)" : ""}`}
            title={config.name}
            onClick={() => setTheme(theme)}
            className={`
              relative
              w-6 h-6
              rounded-full
              transition-all duration-150
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]
              ${isActive ? "scale-110" : "hover:scale-105"}
            `}
            style={{
              backgroundColor: config.color,
              // Active indicator: glowing ring
              boxShadow: isActive
                ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${config.color}, 0 0 12px ${config.color}`
                : "none",
              // Focus ring color matches the theme dot
              // @ts-expect-error -- CSS custom property for focus ring
              "--tw-ring-color": config.color,
            }}
          />
        );
      })}
    </div>
  );
}

export default ThemeSwitcher;
