"use client";

import type { MaterialStatus } from "@/lib/types";

const styles: Record<MaterialStatus, string> = {
  OK: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  LOW_STOCK: "bg-amber-50 text-amber-700 ring-amber-600/20",
  OUT_OF_STOCK: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

const labels: Record<MaterialStatus, string> = {
  OK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
};

interface StatusBadgeProps {
  status: MaterialStatus;
  onClick?: () => void;
}

export function StatusBadge({ status, onClick }: StatusBadgeProps) {
  const base = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} cursor-pointer transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400`}
        title="Click to restock"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
        {labels[status]}
      </button>
    );
  }
  return (
    <span className={base}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {labels[status]}
    </span>
  );
}
