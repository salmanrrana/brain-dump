import { type FC } from "react";
import { Folder } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import type { DashboardAnalytics } from "../../api/analytics";

export interface TopProjectsCardProps {
  analytics: DashboardAnalytics;
}

/**
 * TopProjectsCard - Shows top 5 projects by completed tickets.
 */
export const TopProjectsCard: FC<TopProjectsCardProps> = ({ analytics }) => {
  const { topProjects } = analytics;

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Folder size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Top Projects</h3>
      </div>
      <div style={sectionContentStyles}>
        {topProjects.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
            {topProjects.map((project, index) => (
              <div
                key={project.projectId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--spacing-2)",
                  background: "var(--bg-tertiary)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--text-tertiary)",
                      width: "20px",
                    }}
                  >
                    {index + 1}.
                  </span>
                  <span
                    style={{
                      fontSize: "var(--font-size-sm)",
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {project.name}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
                    color: "var(--accent-primary)",
                  }}
                >
                  {project.completed}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "var(--spacing-4)",
              color: "var(--text-tertiary)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            No completed tickets yet
          </div>
        )}
      </div>
    </section>
  );
};
