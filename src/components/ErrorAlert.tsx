import { AlertCircle } from "lucide-react";

export interface ErrorAlertProps {
  /** Error message string or Error object */
  error: string | Error | null | undefined;
  /** Optional custom class name for additional styling */
  className?: string;
}

/**
 * A reusable error alert component for displaying error messages.
 * Accepts both string messages and Error objects.
 */
export default function ErrorAlert({ error, className = "" }: ErrorAlertProps) {
  if (!error) return null;

  const message = error instanceof Error ? error.message : error;

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 p-3 bg-red-900/30 border border-red-800 rounded-lg ${className}`}
    >
      <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
      <p className="text-sm text-red-300">{message}</p>
    </div>
  );
}
