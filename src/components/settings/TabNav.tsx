import { useRef, useCallback, type KeyboardEvent, type ElementType } from "react";

/**
 * Tab configuration for the settings modal navigation.
 */
export interface Tab {
  /** Unique identifier for the tab */
  id: string;
  /** Display label for the tab */
  label: string;
  /** Lucide React icon component */
  icon: ElementType;
}

export interface TabNavProps {
  /** Array of tab configurations */
  tabs: Tab[];
  /** Currently active tab ID */
  activeTab: string;
  /** Callback when tab changes */
  onTabChange: (tabId: string) => void;
}

/**
 * TabNav component for settings modal tab navigation.
 *
 * Features:
 * - **Tab buttons with icons**: Each tab displays an icon and label
 * - **Active state**: Gradient background with glow effect
 * - **Inactive state**: Ghost styling with hover effects
 * - **Keyboard navigation**: Arrow keys to navigate, Enter/Space to select
 * - **Accessible**: ARIA roles, proper focus management, tablist pattern
 */
export function TabNav({ tabs, activeTab, onTabChange }: TabNavProps) {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const setTabRef = useCallback((tabId: string, element: HTMLButtonElement | null) => {
    if (element) {
      tabRefs.current.set(tabId, element);
    } else {
      tabRefs.current.delete(tabId);
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      let nextIndex: number | null = null;

      switch (event.key) {
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          nextIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
          break;
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          nextIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
          break;
        case "Home":
          event.preventDefault();
          nextIndex = 0;
          break;
        case "End":
          event.preventDefault();
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      if (nextIndex !== null) {
        const nextTab = tabs[nextIndex];
        if (nextTab) {
          const nextElement = tabRefs.current.get(nextTab.id);
          if (nextElement) {
            nextElement.focus();
            onTabChange(nextTab.id);
          }
        }
      }
    },
    [tabs, onTabChange]
  );

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className="flex gap-1 p-1 rounded-lg"
      style={{ background: "var(--bg-secondary)" }}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            ref={(el) => setTabRef(tab.id, el)}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
              transition-all duration-150 ease-out
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
              focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-[var(--bg-secondary)]
            `}
            style={{
              background: isActive ? "var(--gradient-accent)" : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: isActive ? "var(--shadow-glow-sm)" : "none",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default TabNav;
