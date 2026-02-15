import { useRef, useEffect } from "react";

interface LetterGlitchProps {
  glitchColors?: string[];
  className?: string;
  glitchSpeed?: number;
  centerVignette?: boolean;
  outerVignette?: boolean;
  smooth?: boolean;
  characters?: string;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface Letter {
  char: string;
  startColor: RGB;
  targetColor: RGB;
  colorProgress: number;
}

const FONT_SIZE = 16;
const CHAR_WIDTH = 10;
const CHAR_HEIGHT = 20;
const COLOR_TRANSITION_SPEED = 0.03;

const containerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  backgroundColor: "#000000",
  overflow: "hidden",
};

const canvasStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
};

const outerVignetteStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  background: "radial-gradient(circle, rgba(0,0,0,0) 60%, rgba(0,0,0,1) 100%)",
};

const centerVignetteStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  background: "radial-gradient(circle, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 60%)",
};

function hexToRgb(hex: string): RGB {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (_m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1]!, 16), g: parseInt(result[2]!, 16), b: parseInt(result[3]!, 16) }
    : { r: 255, g: 255, b: 255 };
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function LetterGlitch({
  glitchColors = ["#2b4539", "#61dca3", "#61b3dc"],
  className = "",
  glitchSpeed = 50,
  centerVignette: showCenterVignette = false,
  outerVignette: showOuterVignette = true,
  smooth = true,
  characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789",
}: LetterGlitchProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const lettersRef = useRef<Letter[]>([]);
  const gridRef = useRef({ columns: 0, rows: 0 });
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastGlitchTimeRef = useRef(0);
  const canvasSizeRef = useRef({ width: 0, height: 0 });

  // Pre-parse colors to RGB once
  const parsedColorsRef = useRef<RGB[]>([]);
  const charArrayRef = useRef<string[]>([]);

  useEffect(() => {
    parsedColorsRef.current = glitchColors.map(hexToRgb);
    charArrayRef.current = Array.from(characters);
  }, [glitchColors, characters]);

  const getRandomChar = (): string => {
    const arr = charArrayRef.current;
    return arr[Math.floor(Math.random() * arr.length)] ?? "X";
  };

  const getRandomColorRgb = (): RGB => {
    const arr = parsedColorsRef.current;
    return arr[Math.floor(Math.random() * arr.length)] ?? { r: 255, g: 255, b: 255 };
  };

  const initializeLetters = (columns: number, rows: number) => {
    gridRef.current = { columns, rows };
    lettersRef.current = Array.from({ length: columns * rows }, () => {
      const color = getRandomColorRgb();
      return {
        char: getRandomChar(),
        startColor: color,
        targetColor: color,
        colorProgress: 1,
      };
    });
  };

  const drawLetters = () => {
    const ctx = contextRef.current;
    if (!ctx || lettersRef.current.length === 0) return;

    const { width, height } = canvasSizeRef.current;
    ctx.clearRect(0, 0, width, height);

    const { columns } = gridRef.current;
    const letters = lettersRef.current;

    for (let i = 0; i < letters.length; i++) {
      const letter = letters[i]!;
      const x = (i % columns) * CHAR_WIDTH;
      const y = Math.floor(i / columns) * CHAR_HEIGHT;

      // Compute current color via interpolation
      let r: number, g: number, b: number;
      if (letter.colorProgress >= 1) {
        r = letter.targetColor.r;
        g = letter.targetColor.g;
        b = letter.targetColor.b;
      } else {
        const c = lerpRgb(letter.startColor, letter.targetColor, letter.colorProgress);
        r = c.r;
        g = c.g;
        b = c.b;
      }

      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillText(letter.char, x, y);
    }
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    canvasSizeRef.current = { width: rect.width, height: rect.height };

    const ctx = contextRef.current;
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${FONT_SIZE}px monospace`;
      ctx.textBaseline = "top";
    }

    const columns = Math.ceil(rect.width / CHAR_WIDTH);
    const rows = Math.ceil(rect.height / CHAR_HEIGHT);
    initializeLetters(columns, rows);
    drawLetters();
  };

  const animate = (timestamp: number) => {
    const elapsed = timestamp - lastGlitchTimeRef.current;

    // Update glitch characters on schedule
    if (elapsed >= glitchSpeed) {
      const letters = lettersRef.current;
      const updateCount = Math.max(1, Math.floor(letters.length * 0.05));

      for (let i = 0; i < updateCount; i++) {
        const index = Math.floor(Math.random() * letters.length);
        const letter = letters[index];
        if (!letter) continue;

        letter.char = getRandomChar();

        if (smooth) {
          // Snapshot current interpolated color as the new start
          if (letter.colorProgress >= 1) {
            letter.startColor = letter.targetColor;
          } else {
            letter.startColor = lerpRgb(
              letter.startColor,
              letter.targetColor,
              letter.colorProgress
            );
          }
          letter.targetColor = getRandomColorRgb();
          letter.colorProgress = 0;
        } else {
          const c = getRandomColorRgb();
          letter.startColor = c;
          letter.targetColor = c;
          letter.colorProgress = 1;
        }
      }

      lastGlitchTimeRef.current = timestamp;
    }

    // Advance smooth color transitions
    if (smooth) {
      const letters = lettersRef.current;
      for (let i = 0; i < letters.length; i++) {
        const letter = letters[i]!;
        if (letter.colorProgress < 1) {
          letter.colorProgress += COLOR_TRANSITION_SPEED;
          if (letter.colorProgress > 1) letter.colorProgress = 1;
        }
      }
    }

    drawLetters();
    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    contextRef.current = canvas.getContext("2d");
    parsedColorsRef.current = glitchColors.map(hexToRgb);
    charArrayRef.current = Array.from(characters);

    resizeCanvas();
    animationRef.current = requestAnimationFrame(animate);

    let resizeTimeout: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        cancelAnimationFrame(animationRef.current);
        resizeCanvas();
        animationRef.current = requestAnimationFrame(animate);
      }, 100);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", handleResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glitchSpeed, smooth]);

  return (
    <div style={containerStyle} className={className}>
      <canvas ref={canvasRef} style={canvasStyle} className="letter-glitch-canvas" />
      {showOuterVignette && <div style={outerVignetteStyle} />}
      {showCenterVignette && <div style={centerVignetteStyle} />}
    </div>
  );
}
