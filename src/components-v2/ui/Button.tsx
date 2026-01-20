import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
}

function Spinner({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

const SIZE_STYLES: Record<
  ButtonSize,
  { padding: string; fontSize: string; iconSize: string; spinnerSize: string }
> = {
  sm: {
    padding: "var(--spacing-1) var(--spacing-3)",
    fontSize: "var(--font-size-sm)",
    iconSize: "16px",
    spinnerSize: "14px",
  },
  md: {
    padding: "var(--spacing-2) var(--spacing-4)",
    fontSize: "var(--font-size-base)",
    iconSize: "18px",
    spinnerSize: "16px",
  },
  lg: {
    padding: "var(--spacing-3) var(--spacing-6)",
    fontSize: "var(--font-size-lg)",
    iconSize: "20px",
    spinnerSize: "18px",
  },
};

const VARIANT_STYLES: Record<
  ButtonVariant,
  {
    background: string;
    color: string;
    border: string;
    hoverBackground: string;
    hoverBorder?: string;
  }
> = {
  primary: {
    background: "var(--gradient-accent)",
    color: "#ffffff",
    border: "none",
    hoverBackground: "var(--gradient-accent)",
  },
  secondary: {
    background: "transparent",
    color: "var(--text-primary)",
    border: "1px solid var(--border-secondary)",
    hoverBackground: "var(--bg-hover)",
    hoverBorder: "1px solid var(--accent-primary)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "none",
    hoverBackground: "var(--bg-hover)",
  },
  danger: {
    background: "var(--error)",
    color: "#ffffff",
    border: "none",
    hoverBackground: "#dc2626",
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    isLoading = false,
    iconLeft,
    iconRight,
    disabled,
    children,
    className = "",
    style,
    ...props
  },
  ref
) {
  const isDisabled = disabled || isLoading;
  const sizeStyles = SIZE_STYLES[size];
  const variantStyles = VARIANT_STYLES[variant];

  const baseStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-2)",
    padding: sizeStyles.padding,
    fontSize: sizeStyles.fontSize,
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    lineHeight: "var(--line-height-tight)",
    borderRadius: "var(--radius-lg)",
    transition: "all var(--transition-normal)",
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.5 : 1,
    background: variantStyles.background,
    color: variantStyles.color,
    border: variantStyles.border,
    ...style,
  };

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-[var(--bg-primary)]
        ${className}
      `.trim()}
      style={baseStyles}
      data-variant={variant}
      data-size={size}
      data-loading={isLoading ? "true" : undefined}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          const target = e.currentTarget;
          target.style.background = variantStyles.hoverBackground;
          if (variantStyles.hoverBorder) {
            target.style.border = variantStyles.hoverBorder;
          }
          if (variant === "primary") {
            target.style.filter = "brightness(1.1)";
          }
        }
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!isDisabled) {
          const target = e.currentTarget;
          target.style.background = variantStyles.background;
          target.style.border = variantStyles.border;
          target.style.filter = "none";
        }
        props.onMouseLeave?.(e);
      }}
      {...props}
    >
      {isLoading ? (
        <Spinner
          className="shrink-0"
          style={{ width: sizeStyles.spinnerSize, height: sizeStyles.spinnerSize }}
        />
      ) : (
        iconLeft && (
          <span
            className="shrink-0"
            style={{ width: sizeStyles.iconSize, height: sizeStyles.iconSize }}
          >
            {iconLeft}
          </span>
        )
      )}

      {children && <span>{children}</span>}

      {iconRight && !isLoading && (
        <span
          className="shrink-0"
          style={{ width: sizeStyles.iconSize, height: sizeStyles.iconSize }}
        >
          {iconRight}
        </span>
      )}
    </button>
  );
});

export default Button;
