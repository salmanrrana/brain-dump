import React from "react";

export interface FindingRowProps {
  icon: React.ReactNode;
  label: string;
  count: number;
}

export function FindingRow({ icon, label, count }: FindingRowProps) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs text-[var(--text-secondary)]">{label}:</span>
      <span className="text-xs font-medium text-[var(--text-primary)]">{count}</span>
    </div>
  );
}
