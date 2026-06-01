import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { LetterGlitch } from "./LetterGlitch";

const CUSTOM_CHARACTERS = "01█▓▒░BRAINDUMP{}[]<>/*#@&";
const FALLBACK_COLORS = ["#0ea5e9", "#06b6d4", "#3b82f6"];

function getThemeGlitchColors(): string[] {
  if (typeof document === "undefined") return FALLBACK_COLORS;
  const style = getComputedStyle(document.documentElement);
  const colors = [
    style.getPropertyValue("--accent-primary").trim(),
    style.getPropertyValue("--accent-secondary").trim(),
    style.getPropertyValue("--accent-ai").trim(),
  ].filter(Boolean);
  return colors.length > 0 ? colors : FALLBACK_COLORS;
}
// Splash dismissal tracks actual app readiness — there is no artificial minimum
// display time. FADE_DURATION_MS is the only timed value and is kept short so a
// fast cold boot reveals real content almost immediately.
const FADE_DURATION_MS = 300;
// Defer the expensive LetterGlitch canvas animation: only escalate to it if the
// app is still not ready after this window, so it never contends with React
// hydration on a fast cold boot. The splash only "earns" the animation on a
// genuinely slow boot.
const GLITCH_DELAY_MS = 250;

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
};

const spinnerContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  backgroundColor: "var(--bg-primary, #0f172a)",
};

interface SplashScreenProps {
  /** Becomes true once the app has hydrated and is interactive. */
  ready: boolean;
  onComplete: () => void;
}

export function SplashScreen({ ready, onComplete }: SplashScreenProps) {
  const [fadeComplete, setFadeComplete] = useState(false);
  const [showGlitch, setShowGlitch] = useState(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const [prefersReducedMotion] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const [glitchColors] = useState(getThemeGlitchColors);

  // Mark splash screen mount for Performance timeline
  useEffect(() => {
    if (import.meta.env.DEV) {
      performance.mark("splash:mount");
    }
  }, []);

  // Defer the LetterGlitch animation so it never competes with hydration on a
  // fast cold boot. If the app reports ready before GLITCH_DELAY_MS elapses, the
  // timer is cleared and only the cheap spinner is ever shown.
  useEffect(() => {
    if (prefersReducedMotion || ready) return;
    const timer = setTimeout(() => setShowGlitch(true), GLITCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [prefersReducedMotion, ready]);

  // Dismiss as soon as the app is ready — no artificial minimum display time.
  const isFading = ready && !fadeComplete;

  useEffect(() => {
    if (!ready) return;
    if (import.meta.env.DEV) {
      performance.mark("splash:fade-start");
      try {
        performance.measure("Splash: Visible", "splash:mount", "splash:fade-start");
      } catch {
        // mount mark may not exist on HMR
      }
    }
    const timer = setTimeout(() => {
      if (import.meta.env.DEV) {
        performance.mark("splash:complete");
        try {
          performance.measure("Splash: Fade", "splash:fade-start", "splash:complete");
          performance.measure("Splash: Total", "splash:mount", "splash:complete");
        } catch {
          // marks may not exist on HMR
        }
      }
      setFadeComplete(true);
      onCompleteRef.current();
    }, FADE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  if (fadeComplete) return null;

  const style = { ...overlayStyle, opacity: isFading ? 0 : 1 };

  // Cheap spinner path: reduced-motion users, plus every fast boot before the
  // LetterGlitch escalation window elapses.
  if (prefersReducedMotion || !showGlitch) {
    return (
      <div
        role="status"
        aria-label="Loading Brain Dump"
        style={{ ...style, ...spinnerContainerStyle }}
      >
        <Loader2
          className="animate-spin"
          size={48}
          style={{ color: "var(--accent-primary, #f97316)" }}
        />
      </div>
    );
  }

  return (
    <div role="status" aria-label="Loading Brain Dump" style={style}>
      <LetterGlitch
        glitchColors={glitchColors}
        glitchSpeed={10}
        centerVignette
        outerVignette={false}
        smooth
        characters={CUSTOM_CHARACTERS}
      />
    </div>
  );
}
