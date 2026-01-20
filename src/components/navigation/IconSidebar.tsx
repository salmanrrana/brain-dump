import { type FC, type ReactNode } from "react";
import { LayoutDashboard, Kanban, Folder, Settings, type LucideIcon } from "lucide-react";
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
}

export interface IconSidebarProps {
  /** Current active path for highlighting the active nav item */
  activePath?: string;
  /** Handler for route navigation */
  onNavigate?: (path: string) => void;
  /** Handler for action items (Projects panel, Settings modal) */
  onAction?: (action: "openProjectsPanel" | "openSettings") => void;
  /** Custom nav items to override defaults */
  navItems?: NavItemConfig[];
  /** Additional content to render at the bottom of the sidebar */
  footer?: ReactNode;
}

/**
 * Default navigation items for the sidebar.
 */
const defaultNavItems: NavItemConfig[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Kanban, label: "Board", path: "/" },
  { icon: Folder, label: "Projects", action: "openProjectsPanel" },
  { icon: Settings, label: "Settings", action: "openSettings" },
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
  activePath = "/",
  onNavigate,
  onAction,
  navItems = defaultNavItems,
  footer,
}) => {
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

  const handleItemClick = (item: NavItemConfig) => {
    if (item.path && onNavigate) {
      onNavigate(item.path);
    } else if (item.action && onAction) {
      onAction(item.action);
    }
  };

  const isActive = (item: NavItemConfig): boolean => {
    if (!item.path) return false;
    return item.path === activePath;
  };

  return (
    <aside style={sidebarStyles} role="navigation" aria-label="Main navigation">
      <nav style={navStyles}>
        {navItems.map((item) => (
          <NavItem
            key={item.label}
            icon={item.icon}
            label={item.label}
            active={isActive(item)}
            onClick={() => handleItemClick(item)}
          />
        ))}
      </nav>

      {footer && <div style={footerStyles}>{footer}</div>}
    </aside>
  );
};

export default IconSidebar;
