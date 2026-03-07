import { memo } from "react";
import { getCommentAuthorDisplayName, getCommentAuthorStyle } from "../../lib/comment-authors";

// =============================================================================
// Types
// =============================================================================

export interface CommentAvatarProps {
  /** The author of the comment */
  author: string;
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
  const resolvedStyle = getCommentAuthorStyle(author);
  const style: AuthorStyle = {
    gradient: resolvedStyle.gradient,
    display: resolvedStyle.display,
    color: resolvedStyle.color,
  };
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

  const displayName = getCommentAuthorDisplayName(author);
  const displayContent = style.display === "letter" ? displayName.charAt(0) : style.display;

  return (
    <div style={containerStyles} data-testid={testId} aria-hidden="true">
      {displayContent}
    </div>
  );
});

export default CommentAvatar;
