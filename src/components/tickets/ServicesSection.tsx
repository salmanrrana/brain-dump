import { type FC, useMemo } from "react";
import { Globe, Server, BookOpen, Database, ExternalLink } from "lucide-react";
import { useProjectServices, useProjects } from "../../lib/hooks";
import { POLLING_INTERVALS } from "../../lib/constants";
import type { ServiceType } from "../../lib/service-discovery";

const SERVICE_TYPE_ICONS: Record<ServiceType, typeof Globe> = {
  frontend: Globe,
  backend: Server,
  storybook: BookOpen,
  docs: BookOpen,
  database: Database,
  other: Server,
};

const SERVICE_TYPE_COLORS: Record<ServiceType, string> = {
  frontend: "text-[var(--accent-ai)]",
  backend: "text-[var(--status-review)]",
  storybook: "text-[var(--accent-primary)]",
  docs: "text-[var(--success)]",
  database: "text-[var(--warning)]",
  other: "text-[var(--text-secondary)]",
};

export interface ServicesSectionProps {
  projectId: string;
}

export const ServicesSection: FC<ServicesSectionProps> = ({ projectId }) => {
  const { projects } = useProjects();
  const projectPath = useMemo(() => {
    const project = projects.find((p) => p.id === projectId);
    return project?.path ?? null;
  }, [projects, projectId]);

  const { runningServices, error: servicesError } = useProjectServices(projectPath, {
    enabled: true,
    pollingInterval: POLLING_INTERVALS.SERVICES,
  });

  if (servicesError) {
    return (
      <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-300">
        <span className="font-medium">Service discovery error:</span> {servicesError}
      </div>
    );
  }

  if (runningServices.length === 0) return null;

  return (
    <div className="bg-[var(--bg-tertiary)]/50 border border-[var(--border-secondary)] rounded-lg p-3">
      <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2 flex items-center gap-2">
        <Globe size={14} className="text-[var(--accent-ai)]" />
        Running Services
      </h4>
      <div className="space-y-1">
        {runningServices.map((service) => {
          const IconComponent = SERVICE_TYPE_ICONS[service.type];
          const colorClass = SERVICE_TYPE_COLORS[service.type];
          return (
            <a
              key={service.port}
              href={`http://localhost:${service.port}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2 py-1.5 bg-[var(--bg-primary)]/50 rounded hover:bg-[var(--bg-hover)]/50 transition-colors group"
            >
              <IconComponent size={14} className={colorClass} />
              <span className="text-sm text-[var(--text-primary)] flex-1">{service.name}</span>
              <span className="text-xs text-[var(--text-muted)]">localhost:{service.port}</span>
              <ExternalLink
                size={12}
                className="text-[var(--text-muted)] group-hover:text-[var(--accent-ai)] transition-colors"
              />
            </a>
          );
        })}
      </div>
    </div>
  );
};
