import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  type ReactNode,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";

export interface UseProjectsPanelReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  panelRef: RefObject<HTMLElement | null>;
}

interface NavigationContextValue {
  projectsPanelOpen: boolean;
  setProjectsPanelOpen: Dispatch<SetStateAction<boolean>>;
  projectsPanelRef: RefObject<HTMLElement | null>;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [projectsPanelOpen, setProjectsPanelOpen] = useState(false);
  const projectsPanelRef = useRef<HTMLElement | null>(null);

  const value = useMemo<NavigationContextValue>(
    () => ({
      projectsPanelOpen,
      setProjectsPanelOpen,
      projectsPanelRef,
    }),
    [projectsPanelOpen]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useProjectsPanel(): UseProjectsPanelReturn {
  const context = useContext(NavigationContext);

  if (context === null) {
    throw new Error("useProjectsPanel must be used within a NavigationProvider");
  }

  const { projectsPanelOpen, setProjectsPanelOpen, projectsPanelRef } = context;

  const open = useCallback(() => {
    setProjectsPanelOpen(true);
  }, [setProjectsPanelOpen]);

  const close = useCallback(() => {
    setProjectsPanelOpen(false);
  }, [setProjectsPanelOpen]);

  const toggle = useCallback(() => {
    setProjectsPanelOpen((prev) => !prev);
  }, [setProjectsPanelOpen]);

  // Escape key closes panel
  useEffect(() => {
    if (!projectsPanelOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProjectsPanelOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [projectsPanelOpen, setProjectsPanelOpen]);

  // Click outside closes panel
  useEffect(() => {
    if (!projectsPanelOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const panel = projectsPanelRef.current;
      const target = event.target;
      if (panel && target instanceof Node && !panel.contains(target)) {
        setProjectsPanelOpen(false);
      }
    };

    // Delay to avoid closing on the opening click
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [projectsPanelOpen, setProjectsPanelOpen, projectsPanelRef]);

  return {
    isOpen: projectsPanelOpen,
    open,
    close,
    toggle,
    panelRef: projectsPanelRef,
  };
}
