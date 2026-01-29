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

/**
 * Creates a keyboard event handler with ID parameter for list items.
 * Useful for lists where each item has an ID-based click handler.
 *
 * @example
 * ```tsx
 * {items.map(item => (
 *   <div
 *     key={item.id}
 *     role="button"
 *     tabIndex={0}
 *     onClick={() => onClick(item.id)}
 *     onKeyDown={createEnterSpaceHandlerWithId(item.id, onClick)}
 *   >
 *     {item.name}
 *   </div>
 * ))}
 * ```
 */
export function createEnterSpaceHandlerWithId<E extends HTMLElement = HTMLElement>(
  id: string,
  callback: (id: string) => void
): (event: KeyboardEvent<E>) => void {
  return (event: KeyboardEvent<E>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      callback(id);
    }
  };
}
