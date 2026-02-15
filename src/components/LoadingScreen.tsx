import { useState } from "react";
import { Loader2 } from "lucide-react";
import { LetterGlitch } from "./LetterGlitch";

interface LoadingScreenProps {
  compact?: boolean;
  className?: string;
}

const CUSTOM_CHARACTERS = "01█▓▒░BRAINDUMP{}[]<>/*#@&";

const FALLBACK_COLORS = ["#f97316", "#3b82f6", "#14b8a6"];

function getThemeGlitchColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  const colors = [
    style.getPropertyValue("--accent-primary").trim(),
    style.getPropertyValue("--accent-secondary").trim(),
    style.getPropertyValue("--accent-ai").trim(),
  ].filter(Boolean);
  return colors.length > 0 ? colors : FALLBACK_COLORS;
}

const fullScreenStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 40,
};

const compactStyle: React.CSSProperties = {
  width: "100%",
  height: "200px",
};

const spinnerContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  backgroundColor: "var(--bg-primary, #0f172a)",
};

export function LoadingScreen({ compact = false, className = "" }: LoadingScreenProps) {
  const [prefersReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const [glitchColors] = useState(getThemeGlitchColors);

  const containerStyle = compact ? compactStyle : fullScreenStyle;

  if (prefersReducedMotion) {
    return (
      <div style={{ ...containerStyle, ...spinnerContainerStyle }} className={className}>
        <Loader2
          className="animate-spin"
          size={compact ? 32 : 48}
          style={{ color: "var(--accent-primary, #f97316)" }}
        />
      </div>
    );
  }

  return (
    <div style={containerStyle} className={className}>
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
