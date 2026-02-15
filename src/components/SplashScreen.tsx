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
const MIN_DISPLAY_MS = 800;
const FADE_DURATION_MS = 800;

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
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fadeComplete, setFadeComplete] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const [prefersReducedMotion] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const [glitchColors] = useState(getThemeGlitchColors);

  // Minimum display timer
  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Once minimum time has elapsed, start fade-out then signal completion
  const isFading = minTimeElapsed && !fadeComplete;

  useEffect(() => {
    if (!minTimeElapsed) return;
    const timer = setTimeout(() => {
      setFadeComplete(true);
      onCompleteRef.current();
    }, FADE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [minTimeElapsed]);

  if (fadeComplete) return null;

  const style = { ...overlayStyle, opacity: isFading ? 0 : 1 };

  if (prefersReducedMotion) {
    return (
      <div style={{ ...style, ...spinnerContainerStyle }}>
        <Loader2
          className="animate-spin"
          size={48}
          style={{ color: "var(--accent-primary, #f97316)" }}
        />
      </div>
    );
  }

  return (
    <div style={style}>
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
