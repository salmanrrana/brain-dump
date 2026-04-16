import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type MouseEvent,
  type MouseEventHandler,
  type PointerEvent,
  type PointerEventHandler,
} from "react";
import { getTagColor } from "../../lib/tag-colors";
import { createBrowserLogger } from "../../lib/browser-logger";
import { useToast } from "../Toast";

const logger = createBrowserLogger("board:CopyableTag");

/** How long the "Copied!" affordance stays visible */
const COPY_FEEDBACK_MS = 1500;

const tagPillStyles: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "9999px",
  padding: "2px 8px",
  fontSize: "10px",
  fontWeight: 500,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  cursor: "pointer",
  position: "relative",
};

const copiedTooltipStyles: CSSProperties = {
  position: "absolute",
  bottom: "100%",
  left: "50%",
  transform: "translateX(-50%) translateY(-4px)",
  padding: "2px 6px",
  borderRadius: "4px",
  fontSize: "9px",
  fontWeight: 600,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  pointerEvents: "none",
  backgroundColor: "var(--bg-elevated, rgba(30, 30, 30, 0.95))",
  color: "var(--text-primary, #f9fafb)",
  boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.2))",
};

export interface CopyableTagProps {
  /** Tag label to display and copy */
  tag: string;
  /** Invoked after a successful clipboard copy */
  onCopy?: (tag: string) => void;
  className?: string;
  /** Runs before copy logic (e.g. `stopPropagation` on nested controls) */
  onClick?: MouseEventHandler<HTMLSpanElement>;
  onPointerDown?: PointerEventHandler<HTMLSpanElement>;
  /** Runs before activate-key copy logic (e.g. `stopPropagation` inside list rows) */
  onKeyDown?: KeyboardEventHandler<HTMLSpanElement>;
}

/**
 * Read-only tag pill: click or press Enter/Space copies the tag text with brief feedback.
 */
export const CopyableTag = memo(function CopyableTag({
  tag,
  onCopy,
  className,
  onClick: onClickProp,
  onPointerDown: onPointerDownProp,
  onKeyDown: onKeyDownProp,
}: CopyableTagProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const clearCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clearCopiedTimerRef.current) {
        clearTimeout(clearCopiedTimerRef.current);
      }
    };
  }, []);

  const scheduleClearCopied = useCallback(() => {
    if (clearCopiedTimerRef.current) {
      clearTimeout(clearCopiedTimerRef.current);
    }
    clearCopiedTimerRef.current = setTimeout(() => {
      setCopied(false);
      clearCopiedTimerRef.current = null;
    }, COPY_FEEDBACK_MS);
  }, []);

  const copyTag = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(tag);
      setCopied(true);
      scheduleClearCopied();
      onCopy?.(tag);
    } catch (err) {
      logger.error("Failed to copy tag to clipboard", err instanceof Error ? err : undefined);
      showToast("error", "Could not copy tag. Check clipboard permissions.");
    }
  }, [onCopy, scheduleClearCopied, showToast, tag]);

  const handleClick = useCallback(
    async (e: MouseEvent<HTMLSpanElement>) => {
      onClickProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      await copyTag();
    },
    [copyTag, onClickProp]
  );

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLSpanElement>) => {
      onPointerDownProp?.(e);
    },
    [onPointerDownProp]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLSpanElement>) => {
      onKeyDownProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      if (e.key !== "Enter" && e.key !== " ") {
        return;
      }
      e.preventDefault();
      void copyTag();
    },
    [copyTag, onKeyDownProp]
  );

  const color = getTagColor(tag);

  return (
    <span
      role="button"
      tabIndex={0}
      className={className}
      style={{
        ...tagPillStyles,
        backgroundColor: color.bg,
        color: color.text,
      }}
      onClick={(e) => void handleClick(e)}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      aria-label={`Copy tag ${tag}`}
    >
      {tag}
      {copied ? (
        <span style={copiedTooltipStyles} aria-live="polite">
          Copied!
        </span>
      ) : null}
    </span>
  );
});

export default CopyableTag;
