/**
 * Lightweight skeleton components used as `pendingComponent` for TanStack Router routes.
 * Shown during route transitions when loaders are still pending.
 * No data fetching, minimal DOM — just structural placeholders with pulse animation.
 */

const skeleton: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  animation: "pulse 1.5s ease-in-out infinite",
};

// ---------------------------------------------------------------------------
// Board Skeleton
// ---------------------------------------------------------------------------

export function BoardSkeleton() {
  return (
    <div style={boardContainer}>
      {/* Header bar */}
      <div style={boardHeader}>
        <div style={{ ...skeleton, width: "200px", height: "28px" }} />
        <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
          <div style={{ ...skeleton, width: "100px", height: "32px" }} />
          <div style={{ ...skeleton, width: "100px", height: "32px" }} />
        </div>
      </div>
      {/* Columns */}
      <div style={boardColumns}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={boardColumn}>
            <div style={boardColumnHeader}>
              <div style={{ ...skeleton, width: "80px", height: "16px" }} />
              <div
                style={{
                  ...skeleton,
                  width: "24px",
                  height: "16px",
                  borderRadius: "var(--radius-full)",
                }}
              />
            </div>
            {Array.from({ length: 2 - (i % 2) }, (_, j) => (
              <div key={j} style={boardCard}>
                <div style={{ ...skeleton, width: "80%", height: "14px" }} />
                <div
                  style={{
                    ...skeleton,
                    width: "50%",
                    height: "12px",
                    marginTop: "var(--spacing-2)",
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const boardContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
};

const boardHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-3) var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
};

const boardColumns: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-3)",
  flex: 1,
  padding: "var(--spacing-3)",
  overflow: "hidden",
};

const boardColumn: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  display: "flex",
  flexDirection: "column",
};

const boardColumnHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-3) var(--spacing-3)",
  borderBottom: "1px solid var(--border-primary)",
};

const boardCard: React.CSSProperties = {
  padding: "var(--spacing-3)",
  margin: "var(--spacing-2)",
  background: "var(--bg-primary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
};

// ---------------------------------------------------------------------------
// List Skeleton
// ---------------------------------------------------------------------------

export function ListSkeleton() {
  return (
    <div style={listContainer}>
      {/* Header */}
      <div style={listHeader}>
        <div style={{ ...skeleton, width: "140px", height: "28px" }} />
        <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
          <div style={{ ...skeleton, width: "80px", height: "32px" }} />
          <div style={{ ...skeleton, width: "80px", height: "32px" }} />
        </div>
      </div>
      {/* Table rows */}
      <div style={listBody}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={listRow}>
            <div style={{ ...skeleton, width: "60%", height: "14px" }} />
            <div style={{ display: "flex", gap: "var(--spacing-3)", alignItems: "center" }}>
              <div
                style={{
                  ...skeleton,
                  width: "70px",
                  height: "20px",
                  borderRadius: "var(--radius-full)",
                }}
              />
              <div
                style={{
                  ...skeleton,
                  width: "50px",
                  height: "20px",
                  borderRadius: "var(--radius-full)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const listContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
};

const listHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-3) var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
};

const listBody: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  padding: "var(--spacing-2) var(--spacing-4)",
};

const listRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-3) 0",
  borderBottom: "1px solid var(--border-secondary, var(--border-primary))",
};

// ---------------------------------------------------------------------------
// Dashboard Skeleton
// ---------------------------------------------------------------------------

export function DashboardSkeleton() {
  return (
    <div style={dashContainer}>
      {/* Title + tabs */}
      <div style={dashHeaderRow}>
        <div style={{ ...skeleton, width: "160px", height: "32px" }} />
        <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
          <div style={{ ...skeleton, width: "80px", height: "28px" }} />
          <div style={{ ...skeleton, width: "90px", height: "28px" }} />
          <div style={{ ...skeleton, width: "100px", height: "28px" }} />
        </div>
      </div>
      {/* Stats grid */}
      <div style={dashStats}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={dashStatCard}>
            <div style={{ ...skeleton, width: "60px", height: "12px" }} />
            <div
              style={{
                ...skeleton,
                width: "40px",
                height: "28px",
                marginTop: "var(--spacing-2)",
              }}
            />
          </div>
        ))}
      </div>
      {/* Chart grid */}
      <div style={dashChartGrid}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={dashChartCard}>
            <div style={{ ...skeleton, width: "120px", height: "16px" }} />
            <div
              style={{
                ...skeleton,
                width: "100%",
                height: "140px",
                marginTop: "var(--spacing-3)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const dashContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-6)",
  height: "100%",
};

const dashHeaderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-4)",
};

const dashStats: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: "var(--spacing-4)",
};

const dashStatCard: React.CSSProperties = {
  padding: "var(--spacing-4)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
};

const dashChartGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "var(--spacing-4)",
};

const dashChartCard: React.CSSProperties = {
  padding: "var(--spacing-4)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
};

// ---------------------------------------------------------------------------
// Project Detail Skeleton
// ---------------------------------------------------------------------------

export function ProjectDetailSkeleton() {
  return (
    <div style={projContainer}>
      {/* Header */}
      <div style={projHeader}>
        <div style={{ ...skeleton, width: "32px", height: "32px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)", flex: 1 }}>
          <div
            style={{
              ...skeleton,
              width: "12px",
              height: "12px",
              borderRadius: "var(--radius-full)",
            }}
          />
          <div>
            <div style={{ ...skeleton, width: "180px", height: "20px" }} />
            <div
              style={{
                ...skeleton,
                width: "240px",
                height: "14px",
                marginTop: "var(--spacing-1)",
              }}
            />
          </div>
        </div>
        <div style={{ ...skeleton, width: "120px", height: "32px" }} />
      </div>
      {/* Toolbar placeholder */}
      <div style={projToolbar}>
        <div style={{ ...skeleton, width: "100%", height: "36px" }} />
      </div>
      {/* Two-column layout */}
      <div style={projColumns}>
        <div style={projColumn}>
          <div style={projColumnHead}>
            <div style={{ ...skeleton, width: "60px", height: "18px" }} />
          </div>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} style={projEpicRow}>
              <div style={{ ...skeleton, width: "70%", height: "16px" }} />
              <div style={{ ...skeleton, width: "40px", height: "14px" }} />
            </div>
          ))}
        </div>
        <div style={projColumn}>
          <div style={projColumnHead}>
            <div style={{ ...skeleton, width: "100px", height: "18px" }} />
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={projCommitRow}>
              <div style={{ ...skeleton, width: "50px", height: "14px" }} />
              <div style={{ ...skeleton, width: "60%", height: "14px" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const projContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "var(--bg-primary)",
};

const projHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-4)",
  padding: "var(--spacing-4)",
};

const projToolbar: React.CSSProperties = {
  padding: "0 var(--spacing-4) var(--spacing-2)",
};

const projColumns: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--spacing-4)",
  flex: 1,
  overflow: "hidden",
  padding: "0 var(--spacing-4) var(--spacing-4)",
};

const projColumn: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
};

const projColumnHead: React.CSSProperties = {
  padding: "var(--spacing-3) var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
};

const projEpicRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-3) var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
};

const projCommitRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-3) var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
};
