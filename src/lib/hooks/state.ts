/**
 * State utility hooks for managing common UI state patterns.
 * Includes auto-clearing state for notifications and modal interactions.
 */

import { useCallback, useEffect, useState, useRef, type RefObject } from "react";

// =============================================================================
// AUTO-CLEAR STATE HOOK
// =============================================================================

/**
 * Hook for state that automatically clears after a duration.
 * Useful for notifications, copy confirmations, and other transient UI states.
 *
 * @param duration - Time in ms before auto-clearing (default: 5000ms)
 * @returns Tuple of [value, setValue] where setValue triggers the auto-clear timer
 */
export function useAutoClearState<T>(duration = 5000): [T | null, (value: T | null) => void] {
  const [value, setValue] = useState<T | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setValueWithAutoClear = useCallback(
    (newValue: T | null) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setValue(newValue);

      // Only set up auto-clear if we're setting a non-null value
      if (newValue !== null) {
        timeoutRef.current = setTimeout(() => {
          setValue(null);
          timeoutRef.current = null;
        }, duration);
      }
    },
    [duration]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [value, setValueWithAutoClear];
}

// =============================================================================
// MODAL KEYBOARD INTERACTION HOOK
// =============================================================================

/**
 * Hook for handling modal keyboard interactions (Escape to close, focus trap)
 * @param modalRef - Ref to the modal container element
 * @param onClose - Callback to close the modal
 * @param options - Additional options for customizing behavior
 */
export function useModalKeyboard(
  modalRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  options: {
    /** Additional condition for escape key (e.g., dropdown open) - return true to prevent close */
    shouldPreventClose?: () => boolean;
    /** Callback when escape is pressed but close is prevented */
    onPreventedClose?: () => void;
    /** Ref to initial focus element (defaults to first focusable) */
    initialFocusRef?: RefObject<HTMLElement | null>;
  } = {}
) {
  const { shouldPreventClose, onPreventedClose, initialFocusRef } = options;

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (shouldPreventClose?.()) {
          onPreventedClose?.();
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, shouldPreventClose, onPreventedClose]);

  // Focus trap and initial focus
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = modal.querySelectorAll(focusableSelector);
    const firstElement = focusableElements[0] as HTMLElement | undefined;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement | undefined;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTabKey);

    // Set initial focus
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else {
      firstElement?.focus();
    }

    return () => document.removeEventListener("keydown", handleTabKey);
  }, [modalRef, initialFocusRef]);
}

// =============================================================================
// CLICK OUTSIDE HOOK
// =============================================================================

/**
 * Hook for handling click-outside behavior for dropdowns/menus
 * @param ref - Ref to the container element
 * @param onClickOutside - Callback when clicked outside
 * @param isActive - Whether to listen for clicks (e.g., when dropdown is open)
 * @param excludeRef - Optional ref to exclude from click-outside detection (e.g., a trigger button)
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClickOutside: () => void,
  isActive: boolean = true,
  excludeRef?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedOutsideMain = ref.current && !ref.current.contains(target);
      const clickedOutsideExclude = !excludeRef?.current || !excludeRef.current.contains(target);

      if (clickedOutsideMain && clickedOutsideExclude) {
        onClickOutside();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ref, onClickOutside, isActive, excludeRef]);
}
