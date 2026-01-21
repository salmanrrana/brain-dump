import { memo } from "react";
import type { CommentAuthor } from "../../api/comments";

// =============================================================================
// Types
// =============================================================================

export interface CommentAvatarProps {
  /** The author of the comment */
  author: CommentAuthor;
  /** Size of the avatar in pixels (default: 32) */
  size?: number;
  /** Test ID prefix for testing */
  testId?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Author-specific styling configuration */
interface AuthorStyle {
  /** Gradient color stops for background */
  gradient: [string, string];
  /** Display content: icon emoji or 'letter' to show first letter */
  display: "letter" | string;
  /** Text/icon color */
  color: string;
}

const AUTHOR_STYLES: Record<CommentAuthor, AuthorStyle> = {
  claude: {
    gradient: ["#a855f7", "#8b5cf6"], // purple to violet
    display: "✨",
    color: "#ffffff",
  },
  ralph: {
    gradient: ["#06b6d4", "#3b82f6"], // cyan to blue
    display: "🤖",
    color: "#ffffff",
  },
  user: {
    gradient: ["#f97316", "#f59e0b"], // orange to amber
    display: "letter",
    color: "#ffffff",
  },
  opencode: {
    gradient: ["#22c55e", "#10b981"], // green to emerald
    display: "💻",
    color: "#ffffff",
  },
};

// =============================================================================
// CommentAvatar Component
// =============================================================================

/**
 * CommentAvatar - Displays an author avatar with gradient background.
 *
 * Features:
 * - **Gradient backgrounds**: Each author type has a unique gradient
 * - **Icons or letters**: AI authors show emoji icons, users show first letter
 * - **Configurable size**: Default 32px, can be customized
 * - **Rounded**: Full circle with overflow hidden
 *
 * Author Styles:
 * - claude: purple → violet gradient with ✨ icon
 * - ralph: cyan → blue gradient with 🤖 icon
 * - user: orange → amber gradient with first letter
 * - opencode: green → emerald gradient with 💻 icon
 *
 * @example
 * ```tsx
 * <CommentAvatar author="claude" />
 * <CommentAvatar author="user" size={24} />
 * ```
 */
export const CommentAvatar = memo(function CommentAvatar({
  author,
  size = 32,
  testId = "comment-avatar",
}: CommentAvatarProps) {
  const style = AUTHOR_STYLES[author] ?? AUTHOR_STYLES.user;
  const [fromColor, toColor] = style.gradient;

  const containerStyles: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${fromColor}, ${toColor})`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    color: style.color,
    fontSize: style.display === "letter" ? `${size * 0.4}px` : `${size * 0.5}px`,
    fontWeight: 600,
    textTransform: "uppercase",
    overflow: "hidden",
    userSelect: "none",
  };

  const displayContent = style.display === "letter" ? author.charAt(0) : style.display;

  return (
    <div style={containerStyles} data-testid={testId} aria-hidden="true">
      {displayContent}
    </div>
  );
});

export default CommentAvatar;
