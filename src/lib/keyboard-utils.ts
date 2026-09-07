import type { KeyboardEvent } from "react";

/**
 * Check if the current focus is in an input-like element
 * where we should not trigger keyboard shortcuts.
 *
 * @returns true if focus is in INPUT, TEXTAREA, or contenteditable element
 */
export function isInputFocused(): boolean {
  const target = document.activeElement;
  if (!target) return false;

  const tagName = (target as HTMLElement).tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA") {
    return true;
  }

  // Also check for contenteditable elements
  if ((target as HTMLElement).isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Creates a keyboard event handler that triggers callback on Enter or Space.
 * Automatically calls preventDefault() to avoid scrolling on Space.
 *
 * @example
 * ```tsx
 * <div
 *   role="button"
 *   tabIndex={0}
 *   onClick={handleClick}
 *   onKeyDown={createEnterSpaceHandler(handleClick)}
 * >
 *   Clickable content
 * </div>
 * ```
 */
export function createEnterSpaceHandler<E extends HTMLElement = HTMLElement>(
  callback: () => void
): (event: KeyboardEvent<E>) => void {
  return (event: KeyboardEvent<E>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      callback();
    }
  };
}
