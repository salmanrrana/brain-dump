import { type FC, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Home, LayoutDashboard, Kanban, Folder, Settings, type LucideIcon } from "lucide-react";
import { NavItem } from "./NavItem";

export interface NavItemConfig {
  /** Lucide React icon component */
  icon: LucideIcon;
  /** Label for tooltip and accessibility */
  label: string;
  /** Route path for navigation items */
  path?: string;
  /** Action name for items that open panels/modals instead of navigating */
  action?: "openProjectsPanel" | "openSettings";
  /** Keyboard shortcut key (shown in tooltip, e.g., "1" for "Dashboard (1)") */
  shortcutKey?: string;
}

export interface IconSidebarProps {
  /**
   * Current active path for highlighting the active nav item.
   * @deprecated Will be auto-detected from TanStack Router when not provided.
   */
  activePath?: string;
  /**
   * Handler for route navigation.
   * @deprecated Route navigation now uses TanStack Router's <Link> component.
   * This prop is only used for testing/storybook scenarios.
   */
  onNavigate?: (path: string) => void;
  /** Handler for action items (Projects panel, Settings modal) */
  onAction?: (action: "openProjectsPanel" | "openSettings") => void;
  /** Custom nav items to override defaults */
  navItems?: NavItemConfig[];
  /** Additional content to render at the bottom of the sidebar */
  footer?: ReactNode;
  /**
   * When true, disables TanStack Router integration (for testing).
   * Uses onNavigate callback instead of <Link> components.
   */
  disableRouterIntegration?: boolean;
}

/**
 * Default navigation items for the sidebar.
 * Each item has an optional shortcutKey for keyboard navigation (1-4).
 */
const defaultNavItems: NavItemConfig[] = [
  { icon: Home, label: "Home", path: "/", shortcutKey: "1" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", shortcutKey: "2" },
  { icon: Kanban, label: "Board", path: "/board", shortcutKey: "3" },
  { icon: Folder, label: "Projects", action: "openProjectsPanel", shortcutKey: "4" },
  { icon: Settings, label: "Settings", action: "openSettings", shortcutKey: "5" },
];

/**
 * IconSidebar - 64px fixed-width icon-based navigation sidebar.
 *
 * Features:
 * - **64px fixed width**: Compact sidebar that doesn't take up much space
 * - **Full viewport height**: Uses 100vh with flex column layout
 * - **4 nav items**: Dashboard, Board, Projects, Settings
 * - **Icons from lucide-react**: Consistent icon library
 * - **Active item**: Gradient background + glow effect (via NavItem)
 * - **Background**: Uses --bg-secondary CSS variable
 *
 * The sidebar separates route navigation (Dashboard, Board) from action items
 * (Projects panel, Settings modal) via the `onNavigate` and `onAction` callbacks.
 */
export const IconSidebar: FC<IconSidebarProps> = ({
  activePath: activePathProp,
  onNavigate,
  onAction,
  navItems = defaultNavItems,
  footer,
  disableRouterIntegration = false,
}) => {
  // Use TanStack Router's location for active state detection
  // Falls back to activePathProp for testing scenarios
  let currentPath: string;
  try {
    const location = useLocation();
    currentPath = disableRouterIntegration ? (activePathProp ?? "/") : location.pathname;
  } catch (error) {
    // Router context not available (testing without RouterProvider)
    // This is expected in tests but indicates a bug if seen in production
    if (process.env.NODE_ENV !== "production") {
      console.warn("[IconSidebar] Router context unavailable, using fallback path:", error);
    }
    currentPath = activePathProp ?? "/";
  }

  const sidebarStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "64px",
    minWidth: "64px",
    height: "100vh",
    background: "var(--bg-secondary)",
    borderRight: "1px solid var(--border-primary)",
    padding: "var(--spacing-3) 0",
    gap: "var(--spacing-2)",
  };

  const navStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--spacing-2)",
  };

  const footerStyles: React.CSSProperties = {
    marginTop: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--spacing-2)",
  };

  const handleActionClick = (item: NavItemConfig) => {
    if (item.action && onAction) {
      onAction(item.action);
    }
  };

  const handleLegacyNavigate = (item: NavItemConfig) => {
    if (item.path && onNavigate) {
      onNavigate(item.path);
    }
  };

  const isActive = (item: NavItemConfig): boolean => {
    if (!item.path) return false;
    return item.path === currentPath;
  };

  /**
   * Renders a nav item - either as a Link (for routes) or button (for actions).
   * When router integration is disabled (testing), uses buttons for everything.
   */
  const renderNavItem = (item: NavItemConfig) => {
    const navItemElement = (
      <NavItem
        key={item.label}
        icon={item.icon}
        label={item.label}
        active={isActive(item)}
        onClick={item.action ? () => handleActionClick(item) : undefined}
        shortcutKey={item.shortcutKey}
      />
    );

    // Route items: use Link for proper navigation (unless disabled for testing)
    if (item.path && !disableRouterIntegration) {
      return (
        <Link key={item.label} to={item.path} style={{ textDecoration: "none" }}>
          {navItemElement}
        </Link>
      );
    }

    // Action items: always use the NavItem's onClick
    // Testing mode: also use onClick with legacy handler
    if (item.path && disableRouterIntegration) {
      return (
        <NavItem
          key={item.label}
          icon={item.icon}
          label={item.label}
          active={isActive(item)}
          onClick={() => handleLegacyNavigate(item)}
          shortcutKey={item.shortcutKey}
        />
      );
    }

    return navItemElement;
  };

  return (
    <aside style={sidebarStyles} role="navigation" aria-label="Main navigation">
      <nav style={navStyles}>{navItems.map(renderNavItem)}</nav>

      {footer && <div style={footerStyles}>{footer}</div>}
    </aside>
  );
};

export default IconSidebar;
