import { useTechStack } from "../../lib/hooks";

interface TechStackCardProps {
  projectPath: string;
}

export default function TechStackCard({ projectPath }: TechStackCardProps) {
  const { data, isLoading, error } = useTechStack(projectPath);

  return (
    <div style={cardStyles}>
      <h3 style={headerStyles}>🏗️ Tech Stack</h3>

      {isLoading && (
        <div style={contentStyles}>
          <div style={skeletonLineStyles} />
          <div style={skeletonLineStyles} />
          <div style={skeletonLineStyles} />
        </div>
      )}

      {error && (
        <div style={errorStyles}>
          <p style={errorTextStyles}>Could not detect tech stack</p>
        </div>
      )}

      {!isLoading && !error && data && (
        <div style={contentStyles}>
          {data.languages.length > 0 && (
            <div style={sectionStyles}>
              <p style={sectionLabelStyles}>Languages:</p>
              <div style={itemListStyles}>
                {data.languages.map((lang: { name: string; icon: string; version?: string }) => (
                  <div key={lang.name} style={tagStyles}>
                    <span style={tagIconStyles}>{lang.icon}</span>
                    <span style={tagTextStyles}>
                      {lang.name}
                      {lang.version && ` ${lang.version}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.frameworks.length > 0 && (
            <div style={sectionStyles}>
              <p style={sectionLabelStyles}>Frameworks:</p>
              <div style={itemListStyles}>
                {data.frameworks.map(
                  (framework: { name: string; icon: string; version?: string }) => (
                    <div key={framework.name} style={tagStyles}>
                      <span style={tagIconStyles}>{framework.icon}</span>
                      <span style={tagTextStyles}>
                        {framework.name}
                        {framework.version && ` ${framework.version}`}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {data.totalDependencies > 0 && (
            <p style={depsTextStyles}>{data.totalDependencies} total dependencies</p>
          )}

          {data.languages.length === 0 && data.frameworks.length === 0 && (
            <p style={emptyTextStyles}>No tech stack detected</p>
          )}
        </div>
      )}
    </div>
  );
}

const cardStyles: React.CSSProperties = {
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  padding: "var(--spacing-4)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const headerStyles: React.CSSProperties = {
  fontSize: "var(--font-size-md)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

const contentStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const sectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const sectionLabelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const itemListStyles: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--spacing-2)",
};

const tagStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-1)",
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-secondary)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-secondary)",
};

const tagIconStyles: React.CSSProperties = {
  display: "inline-flex",
  fontSize: "var(--font-size-sm)",
};

const tagTextStyles: React.CSSProperties = {
  whiteSpace: "nowrap",
};

const depsTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  margin: 0,
};

const emptyTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-tertiary)",
  margin: 0,
};

const errorStyles: React.CSSProperties = {
  padding: "var(--spacing-2)",
  background: "var(--bg-destructive-subtle)",
  border: "1px solid var(--border-destructive)",
  borderRadius: "var(--radius-sm)",
};

const errorTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-destructive)",
  margin: 0,
};

const skeletonLineStyles: React.CSSProperties = {
  height: "20px",
  background:
    "linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%)",
  backgroundSize: "200% 100%",
  borderRadius: "var(--radius-sm)",
  animation: "pulse 1.5s ease-in-out infinite",
};
