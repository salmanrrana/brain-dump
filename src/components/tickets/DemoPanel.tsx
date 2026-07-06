import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Circle,
  FileJson,
  ImageIcon,
  Loader2,
  MinusCircle,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import {
  useDemoScript,
  useTicketAttachments,
  useVerificationJobStatus,
  useVerificationRuns,
  type Attachment,
  type VerificationJob,
  type VerificationRunSummary,
  type VerificationStepVerdict,
} from "../../lib/hooks";
import type { DemoStep as DemoStepSchema } from "../../lib/schema";
import type { DemoStepStatus } from "./DemoStep";

export interface DemoPanelProps {
  ticketId: string;
  ticketStatus?: string | undefined;
  isBlocked?: boolean | null | undefined;
  blockedReason?: string | null | undefined;
  pollingInterval?: number | undefined;
  /** Kept for existing callers; verification runner completion replaces manual approval. */
  onComplete?: (passed: boolean) => void;
}

const READ_ONLY_STATUS_CONFIG: Record<
  DemoStepStatus,
  { label: string; className: string; icon: ReactNode }
> = {
  pending: {
    label: "Pending",
    className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
    icon: <Circle size={14} />,
  },
  passed: {
    label: "Passed",
    className: "bg-[var(--success-muted)] text-[var(--success)]",
    icon: <CheckCircle2 size={14} />,
  },
  failed: {
    label: "Failed",
    className: "bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]",
    icon: <XCircle size={14} />,
  },
  skipped: {
    label: "Skipped",
    className: "bg-[var(--bg-hover)] text-[var(--text-tertiary)]",
    icon: <MinusCircle size={14} />,
  },
};

const RUN_STATUS_CONFIG: Record<
  VerificationRunSummary["status"],
  { label: string; className: string; icon: ReactNode }
> = {
  passed: {
    label: "Passed",
    className: "bg-[var(--success-muted)] text-[var(--success)]",
    icon: <CheckCircle2 size={14} />,
  },
  failed: {
    label: "Failed",
    className: "bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]",
    icon: <XCircle size={14} />,
  },
  uncertified: {
    label: "Uncertified",
    className: "bg-[var(--warning-muted)] text-[var(--warning)]",
    icon: <ShieldAlert size={14} />,
  },
  infra_error: {
    label: "Infra Error",
    className: "bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]",
    icon: <AlertTriangle size={14} />,
  },
};

const INTEGRITY_CONFIG: Record<
  VerificationRunSummary["integrityStatus"],
  { label: string; className: string; title: string; icon: ReactNode }
> = {
  valid: {
    label: "Valid",
    className: "bg-[var(--success-muted)] text-[var(--success)]",
    title: "Manifest hash and immutable run metadata match the stored run.",
    icon: <ShieldCheck size={14} />,
  },
  tampered: {
    label: "Tampered",
    className: "bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]",
    title: "Manifest contents no longer match the stored run metadata or hash.",
    icon: <ShieldAlert size={14} />,
  },
  "uncertified-tripwire": {
    label: "Uncertified Tripwire",
    className: "bg-[var(--warning-muted)] text-[var(--warning)]",
    title: "The runner refused certification because the diff touched verification code.",
    icon: <ShieldAlert size={14} />,
  },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function formatJobAttempt(job: VerificationJob): string {
  return job.attemptCount === 0 ? "No attempts yet" : `Attempt ${job.attemptCount}`;
}

function getVerificationJobTitle(job: VerificationJob): string {
  if (job.status === "queued") return "Verification queued";
  if (job.status === "running") return "Verification running";
  if (job.status === "failed") return "Verification retry scheduled";
  if (job.status === "blocked" || job.status === "dead") return "Verification blocked";
  return "Verification complete";
}

function getVerificationJobClassName(job: VerificationJob): string {
  if (job.status === "blocked" || job.status === "dead") {
    return "border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/10";
  }
  if (job.status === "failed") return "border-[var(--warning)]/30 bg-[var(--warning-muted)]";
  return "border-[var(--info)]/30 bg-[var(--bg-secondary)]";
}

function getPanelSubheading(
  ticketStatus: string | undefined,
  latestRun: VerificationRunSummary | null
): string {
  if (latestRun) return "Runner results, evidence, and integrity checks are recorded below.";
  if (ticketStatus === "ai_verification") {
    return "The automatic verification runner owns execution, evidence, and completion.";
  }
  return "These steps are waiting for the verification runner. Manual approval has been retired.";
}

function filenameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function isLikelyImage(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(path);
}

function buildAttachmentLookup(attachments: Attachment[]): Map<string, Attachment> {
  return new Map(attachments.map((attachment) => [attachment.filename, attachment]));
}

function findAttachmentForEvidence(
  attachmentLookup: Map<string, Attachment>,
  evidencePath: string
): Attachment | null {
  return attachmentLookup.get(filenameFromPath(evidencePath)) ?? null;
}

function StatusPill({ config }: { config: { label: string; className: string; icon: ReactNode } }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function IntegrityBadge({ run }: { run: VerificationRunSummary }) {
  const config = INTEGRITY_CONFIG[run.integrityStatus];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}
      title={config.title}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function Lightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        // Capture-phase stopPropagation keeps parent modals (e.g. TicketModal's
        // document-level Escape handler) from also closing while the lightbox is open.
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      event.stopPropagation();

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Evidence image: ${attachment.filename}`}
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-primary)] p-3">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {attachment.filename}
            </h4>
            <p className="text-xs text-[var(--text-tertiary)]">Verification screenshot evidence</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            aria-label="Close evidence image"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(90vh-64px)] overflow-auto bg-[var(--bg-secondary)] p-4">
          <img
            src={attachment.url}
            alt={`Verification evidence ${attachment.filename}`}
            className="mx-auto h-auto max-w-full rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}

function ApiEvidence({ verdict }: { verdict: VerificationStepVerdict }) {
  if (!verdict.request && !verdict.response) return null;

  return (
    <details className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
      <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)]">
        API request and response
      </summary>
      <div className="mt-3 grid gap-3 text-xs text-[var(--text-secondary)]">
        {verdict.request && (
          <div>
            <p className="mb-1 font-semibold text-[var(--text-primary)]">Request</p>
            <div className="rounded-md bg-[var(--bg-tertiary)] p-2 font-mono">
              <span className="font-semibold text-[var(--info)]">{verdict.request.method}</span>{" "}
              {verdict.request.url}
            </div>
            {verdict.request.body !== undefined && (
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-2 font-mono text-xs">
                {JSON.stringify(verdict.request.body, null, 2)}
              </pre>
            )}
          </div>
        )}
        {verdict.response && (
          <div>
            <p className="mb-1 font-semibold text-[var(--text-primary)]">Response</p>
            <div className="mb-2 inline-flex rounded-full bg-[var(--bg-tertiary)] px-2 py-1 font-mono">
              Status {verdict.response.status}
            </div>
            <pre className="max-h-48 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-2 font-mono text-xs">
              {verdict.response.body}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}

function EvidenceList({
  verdict,
  attachmentLookup,
  onOpenImage,
}: {
  verdict: VerificationStepVerdict;
  attachmentLookup: Map<string, Attachment>;
  onOpenImage: (attachment: Attachment) => void;
}) {
  if (verdict.evidenceFiles.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {verdict.evidenceFiles.map((file) => {
        const attachment = findAttachmentForEvidence(attachmentLookup, file.path);
        const label = filenameFromPath(file.path);
        const showImage = attachment?.isImage || isLikelyImage(file.path);

        if (attachment && showImage) {
          return (
            <button
              key={`${file.path}-${file.hash}`}
              type="button"
              onClick={() => onOpenImage(attachment)}
              className="group overflow-hidden rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-left transition-colors hover:border-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              aria-label={`Open screenshot evidence ${label}`}
            >
              <img
                src={attachment.url}
                alt={`Screenshot evidence ${label}`}
                loading="lazy"
                className="aspect-video w-full bg-[var(--bg-tertiary)] object-cover"
              />
              <span className="flex items-center gap-2 p-2 text-xs text-[var(--text-secondary)]">
                <ImageIcon size={14} aria-hidden="true" />
                <span className="truncate">{label}</span>
              </span>
            </button>
          );
        }

        if (attachment) {
          return (
            <a
              key={`${file.path}-${file.hash}`}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-2 text-xs text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
            >
              <FileJson size={14} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </a>
          );
        }

        return (
          <span
            key={`${file.path}-${file.hash}`}
            title="Evidence file not uploaded as an attachment"
            className="flex items-center gap-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-2 text-xs text-[var(--text-tertiary)]"
          >
            <FileJson size={14} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </span>
        );
      })}
    </div>
  );
}

function ReadOnlyDemoStep({
  step,
  verdict,
  attachmentLookup,
  onOpenImage,
}: {
  step: DemoStepSchema;
  verdict?: VerificationStepVerdict | undefined;
  attachmentLookup: Map<string, Attachment>;
  onOpenImage: (attachment: Attachment) => void;
}) {
  const status = (verdict?.status ?? step.status ?? "pending") as DemoStepStatus;
  const statusConfig = READ_ONLY_STATUS_CONFIG[status];

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--text-primary)]">Step {step.order}</span>
            <span className="rounded-full bg-[var(--info-muted)] px-2 py-1 text-xs capitalize text-[var(--info)]">
              {step.type}
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{step.description}</p>
        </div>
        <StatusPill config={statusConfig} />
      </div>

      <div className="mt-4 space-y-3 border-t border-[var(--border-primary)] pt-4">
        <div>
          <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">Expected Outcome:</p>
          <p className="text-sm text-[var(--text-secondary)]">{step.expectedOutcome}</p>
        </div>
        {(verdict?.message || step.notes) && (
          <div>
            <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">Runner Notes:</p>
            <p className="text-sm text-[var(--text-secondary)]">{verdict?.message || step.notes}</p>
          </div>
        )}
        {verdict && (
          <>
            <EvidenceList
              verdict={verdict}
              attachmentLookup={attachmentLookup}
              onOpenImage={onOpenImage}
            />
            <ApiEvidence verdict={verdict} />
          </>
        )}
      </div>
    </div>
  );
}

function VerificationRunHistory({ runs }: { runs: VerificationRunSummary[] }) {
  if (runs.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3">
      <h4 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Verification run history
      </h4>
      <div className="space-y-2">
        {runs.map((run, index) => {
          const statusConfig = RUN_STATUS_CONFIG[run.status];
          return (
            <details
              key={run.id}
              open={index === 0}
              className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)] [&::-webkit-details-marker]:hidden">
                <ChevronDown size={14} aria-hidden="true" />
                <span className="font-medium text-[var(--text-primary)]">Run {run.round}</span>
                <StatusPill config={statusConfig} />
                <IntegrityBadge run={run} />
                {run.gitSha && <span className="font-mono text-xs">{run.gitSha.slice(0, 8)}</span>}
              </summary>
              <div className="mt-3 grid gap-1 border-t border-[var(--border-primary)] pt-3 text-xs text-[var(--text-tertiary)] sm:grid-cols-2">
                <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
                <span>Duration: {formatDuration(run.durationMs)}</span>
                <span>Finished: {new Date(run.finishedAt).toLocaleString()}</span>
                <span>Evidence files: {run.manifest?.evidenceFiles.length ?? 0}</span>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function VerificationJobStatusPanel({
  job,
  loading,
  error,
}: {
  job: VerificationJob | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 text-sm text-[var(--text-secondary)]">
        <Loader2 className="animate-spin" size={16} aria-hidden="true" />
        Loading verification queue status...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-4 text-sm text-[var(--accent-danger)]">
        <p className="font-medium">Verification queue status unavailable</p>
        <p className="mt-1 text-[var(--text-secondary)]">{error}</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-muted)] p-4 text-sm text-[var(--text-secondary)]">
        <p className="font-medium text-[var(--text-primary)]">No verification job found</p>
        <p className="mt-1">
          This ticket is in AI verification, but no automatic runner job is queued yet. Regenerate
          the demo or check the verification worker health.
        </p>
      </div>
    );
  }

  const blocked = job.status === "blocked" || job.status === "dead";
  const running = job.status === "running";
  const succeeded = job.status === "succeeded";
  const title = getVerificationJobTitle(job);
  const borderClass = getVerificationJobClassName(job);

  return (
    <div className={`rounded-lg border p-4 text-sm text-[var(--text-secondary)] ${borderClass}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 font-semibold text-[var(--text-primary)]">
        {running ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : null}
        {blocked ? <AlertTriangle size={16} aria-hidden="true" /> : null}
        <span>{title}</span>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Status</dt>
          <dd className="capitalize text-[var(--text-primary)]">{job.status.replace("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Attempt</dt>
          <dd className="text-[var(--text-primary)]">{formatJobAttempt(job)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Next run</dt>
          <dd className="text-[var(--text-primary)]">{formatDateTime(job.nextRunAt)}</dd>
        </div>
        {job.leaseExpiresAt && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
              Lease expires
            </dt>
            <dd className="text-[var(--text-primary)]">{formatDateTime(job.leaseExpiresAt)}</dd>
          </div>
        )}
      </dl>
      {job.lastError && (
        <p className="mt-3 rounded-md bg-[var(--bg-secondary)] p-2 text-[var(--text-secondary)]">
          {job.lastError}
        </p>
      )}
      {succeeded && (
        <p className="mt-3 text-[var(--text-secondary)]">
          The latest queued verification job completed; run evidence is shown below when available.
        </p>
      )}
    </div>
  );
}

/**
 * Read-only verification evidence panel.
 *
 * Manual approval/rejection was retired with the AI verification status. The
 * verification runner executes these steps, records evidence, and owns the
 * ai_verification -> done / in_progress transition.
 */
export function DemoPanel({
  ticketId,
  ticketStatus,
  isBlocked = false,
  blockedReason,
  pollingInterval = 0,
}: DemoPanelProps) {
  const shouldPoll = ticketStatus === "ai_verification" && pollingInterval > 0;
  const { demoScript, loading, error, refetch } = useDemoScript(ticketId, {
    pollingInterval: shouldPoll ? pollingInterval : 0,
  });
  const {
    verificationRuns,
    loading: runsLoading,
    error: runsError,
  } = useVerificationRuns(ticketId, {
    pollingInterval: shouldPoll ? pollingInterval : 0,
  });
  const {
    verificationJob,
    loading: jobLoading,
    error: jobError,
  } = useVerificationJobStatus(ticketId, {
    enabled: ticketStatus === "ai_verification",
    pollingInterval: shouldPoll ? pollingInterval : 0,
  });
  const { attachments } = useTicketAttachments(ticketId, { enabled: verificationRuns.length > 0 });
  const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null);

  const attachmentLookup = useMemo(() => buildAttachmentLookup(attachments), [attachments]);
  const latestRun = verificationRuns[0] ?? null;
  const verdictsByOrder = useMemo(() => {
    const entries =
      latestRun?.manifest?.stepVerdicts.map((verdict) => [verdict.order, verdict] as const) ?? [];
    return new Map(entries);
  }, [latestRun]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-[var(--text-secondary)]">
        <Loader2 className="mr-2 animate-spin" size={20} />
        <span>Loading verification script...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-4 text-[var(--accent-danger)]">
        <p>Failed to load verification script: {error}</p>
        <button
          onClick={() => void refetch()}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!demoScript) {
    return (
      <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] p-6 text-center">
        <p className="text-[var(--text-secondary)]">
          No verification script generated for this ticket yet.
        </p>
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">
          A verification script will be available after the AI completes its review.
        </p>
      </div>
    );
  }

  const heading = ticketStatus === "done" ? "Verification Evidence" : "AI Verification Handoff";
  const subheading = getPanelSubheading(ticketStatus, latestRun);

  return (
    <div className="space-y-4 rounded-lg border border-[var(--info)]/30 bg-[var(--info-muted)] p-6">
      <div className="flex items-start gap-3">
        <PlayCircle className="mt-0.5 text-[var(--info)]" size={24} aria-hidden="true" />
        <div>
          <h3 className="font-semibold text-[var(--text-primary)]">{heading}</h3>
          <p className="text-sm text-[var(--text-secondary)]">{subheading}</p>
        </div>
      </div>

      {isBlocked && (
        <div className="rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/10 p-4 text-[var(--accent-danger)]">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>Verification needs attention</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {blockedReason ??
              "The ticket is blocked in verification and requires manual investigation."}
          </p>
        </div>
      )}

      {runsError && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-muted)] p-3 text-sm text-[var(--warning)]">
          Verification run history could not be loaded: {runsError}
        </div>
      )}

      {runsLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 text-sm text-[var(--text-secondary)]">
          <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          Loading verification run history...
        </div>
      )}

      {!latestRun && ticketStatus === "ai_verification" && (
        <VerificationJobStatusPanel job={verificationJob} loading={jobLoading} error={jobError} />
      )}

      <VerificationRunHistory runs={verificationRuns} />

      {demoScript.completedAt && (
        <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 text-sm text-[var(--text-secondary)]">
          Last recorded result: {demoScript.passed ? "passed" : "failed"} on{" "}
          {new Date(demoScript.completedAt).toLocaleString()}.
        </div>
      )}

      {demoScript.feedback && (
        <div className="rounded-lg bg-[var(--bg-secondary)] p-3">
          <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">Feedback:</p>
          <p className="text-sm text-[var(--text-secondary)]">{demoScript.feedback}</p>
        </div>
      )}

      <div className="space-y-3">
        {demoScript.steps.map((step) => (
          <ReadOnlyDemoStep
            key={step.order}
            step={step}
            verdict={verdictsByOrder.get(step.order)}
            attachmentLookup={attachmentLookup}
            onOpenImage={setLightboxAttachment}
          />
        ))}
      </div>

      {lightboxAttachment && (
        <Lightbox attachment={lightboxAttachment} onClose={() => setLightboxAttachment(null)} />
      )}
    </div>
  );
}

export default DemoPanel;
