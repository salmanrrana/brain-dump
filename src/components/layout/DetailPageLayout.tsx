import type { CSSProperties, ReactNode } from "react";

/** Merge a base class with an optional caller-provided class. */
function cx(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

/**
 * DetailPageLayout — a responsive workspace shell for the ticket and epic
 * detail pages.
 *
 * ## Why
 * Both detail pages used to hardcode `maxWidth: 1200px; margin: 0 auto` plus a
 * single `3fr 2fr` grid, which left a narrow centered ribbon on wide displays
 * and an endless stack of full-width cards below. This shell fixes the
 * wasted-canvas problem in one place so the ticket and epic pages stay a
 * consistent family.
 *
 * ## Composition (the public API)
 * The shell is intentionally compositional rather than a single slot-prop bag,
 * so each page can place full-bleed regions before AND after the two-column
 * body and decide which content is prose-capped.
 *
 * ```tsx
 * <DetailPageLayout>
 *   // Full-bleed regions: span the whole bounded canvas (header, diff surfaces).
 *   <DetailPageFullBleed>
 *     <TicketDetailHeader … />
 *     <WorkflowProgress … />
 *     <TicketCodeChangesSection … />
 *   </DetailPageFullBleed>
 *
 *   // Two-column body: primary reading column + sticky secondary rail.
 *   <DetailPageBody>
 *     <DetailPagePrimary>
 *       // Cap prose at a comfortable measure even though the page is wide.
 *       <DetailPageProse>
 *         <TicketDescription … />
 *       </DetailPageProse>
 *       <ActivitySection … />
 *     </DetailPagePrimary>
 *
 *     <DetailPageRail>
 *       <SubtasksProgress … />
 *       <TicketCostPanel … />
 *     </DetailPageRail>
 *   </DetailPageBody>
 * </DetailPageLayout>
 * ```
 *
 * ## Responsive behavior
 * - Outer container is fluid and centered, capped at ~1680px (wider than the
 *   old 1200px) so wide displays actually use the canvas.
 * - At ≥1024px the body is a two-column grid (primary + rail) and the rail is
 *   sticky within the page scroll container. Below 1024px it collapses to a
 *   single column with the rail stacked under the primary content.
 * - The primary reading column stays full-width; only `DetailPageProse` caps
 *   text at ~72ch (wide canvas ≠ wide prose).
 * - Sticky rail uses the semantic `--z-sticky` token (no arbitrary 9999) and
 *   scrolls internally if it ever grows taller than the viewport, so it never
 *   traps the page scroll.
 *
 * All responsive rules live in `src/styles.css` under
 * "DETAIL PAGE WORKSPACE LAYOUT" because inline styles cannot express media
 * queries or `position: sticky` breakpoints.
 */

interface DetailPageLayoutProps {
  children: ReactNode;
  /** Extra class names appended to the root scroll container. */
  className?: string;
  /** Optional inline overrides for the root scroll container. */
  style?: CSSProperties;
  /** Optional test id forwarded to the root element. */
  testId?: string;
}

/**
 * Root of the shell. Owns the page scroll and centers a wide, bounded inner
 * column. Place {@link DetailPageFullBleed} and {@link DetailPageBody} as
 * direct children.
 */
export function DetailPageLayout({ children, className, style, testId }: DetailPageLayoutProps) {
  return (
    <div className={cx("detail-page-layout", className)} style={style} data-testid={testId}>
      <div className="detail-page-layout__inner">{children}</div>
    </div>
  );
}

interface DetailPageRegionProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}

/**
 * A region that spans the full bounded canvas width (e.g. header, workflow
 * progress, code-changes diff). Stack several of these before or after the
 * body as needed.
 */
export function DetailPageFullBleed({ children, className, style, testId }: DetailPageRegionProps) {
  return (
    <div className={cx("detail-page-full-bleed", className)} style={style} data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * The two-column body: primary content + optional sticky rail. Multi-column on
 * wide screens, single column (rail stacked below) on narrow screens.
 */
export function DetailPageBody({ children, className, style, testId }: DetailPageRegionProps) {
  return (
    <div className={cx("detail-page-body", className)} style={style} data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * The primary reading column inside {@link DetailPageBody}. Stays full column
 * width — wrap prose in {@link DetailPageProse} to cap its measure.
 */
export function DetailPagePrimary({ children, className, style, testId }: DetailPageRegionProps) {
  return (
    <div className={cx("detail-page-primary", className)} style={style} data-testid={testId}>
      {children}
    </div>
  );
}

interface DetailPageRailProps extends DetailPageRegionProps {
  /**
   * Accessible label for the rail's complementary landmark. Set this when a
   * page renders more than one `<aside>` so screen-reader users can tell the
   * rail apart when navigating by landmark.
   */
  ariaLabel?: string;
}

/**
 * The secondary rail inside {@link DetailPageBody}. Rendered as a complementary
 * landmark (`<aside>`) and sticky on wide screens. Holds scan-and-monitor
 * panels (subtasks, findings, cost, telemetry, metadata).
 */
export function DetailPageRail({
  children,
  className,
  style,
  testId,
  ariaLabel,
}: DetailPageRailProps) {
  return (
    <aside
      className={cx("detail-page-rail", className)}
      style={style}
      data-testid={testId}
      aria-label={ariaLabel}
    >
      {children}
    </aside>
  );
}

/**
 * Caps its children at a comfortable reading measure (~72ch) so prose stays
 * legible even when the surrounding page is wide. Use around descriptions and
 * other long-form text, not around full-width panels.
 */
export function DetailPageProse({ children, className, style, testId }: DetailPageRegionProps) {
  return (
    <div className={cx("detail-page-prose", className)} style={style} data-testid={testId}>
      {children}
    </div>
  );
}
