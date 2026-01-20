import type { KeyboardEvent } from "react";

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
