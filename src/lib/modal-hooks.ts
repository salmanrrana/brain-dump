/**
 * Modal Hooks
 *
 * Simple, reusable hooks for managing modal state.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const modal = useModal();
 *
 *   return (
 *     <>
 *       <button onClick={modal.open}>Open Modal</button>
 *       <Modal isOpen={modal.isOpen} onClose={modal.close}>
 *         <Modal.Header title="My Modal" onClose={modal.close} />
 *         <Modal.Body>Content here</Modal.Body>
 *       </Modal>
 *     </>
 *   );
 * }
 * ```
 */

import { useState, useCallback } from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Return type for the useModal hook.
 */
export interface UseModalReturn {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Open the modal */
  open: () => void;
  /** Close the modal */
  close: () => void;
  /** Toggle the modal open/closed */
  toggle: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for managing modal open/close state.
 *
 * Returns memoized functions that maintain stable references across renders,
 * making them safe to use in dependency arrays.
 *
 * @param initialState - Initial open state (default: false)
 * @returns Object with isOpen state and open/close/toggle functions
 *
 * @example
 * ```tsx
 * // Basic usage
 * const modal = useModal();
 *
 * // Start open
 * const confirmModal = useModal(true);
 *
 * // In JSX
 * <button onClick={modal.open}>Open</button>
 * <button onClick={modal.toggle}>Toggle</button>
 * <Modal isOpen={modal.isOpen} onClose={modal.close}>
 *   <Modal.Header title="Title" onClose={modal.close} />
 * </Modal>
 * ```
 */
export function useModal(initialState: boolean = false): UseModalReturn {
  const [isOpen, setIsOpen] = useState(initialState);

  // Memoize functions to maintain stable references
  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}
