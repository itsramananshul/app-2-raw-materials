"use client";

import { useMemo } from "react";
import type { MaterialStatus, RawMaterialView } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import type { ActionKind } from "./QuantityModal";

export type StatusFilter = "ALL" | MaterialStatus;

interface MaterialPlansProps {
  materials: RawMaterialView[];
  loading: boolean;
  filter: StatusFilter;
  expanded: boolean;
  onAction: (material: RawMaterialView, action: ActionKind) => void;
  onToggleExpand: () => void;
}

const FILTER_LABEL: Record<StatusFilter, string> = {
  ALL: "All",
  OK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
};

export function MaterialPlans({
  materials,
  loading,
  filter,
  expanded,
  onAction,
  onToggleExpand,
}: MaterialPlansProps) {
  const filtered = useMemo(() => {
    if (filter === "ALL") return materials;
    return materials.filter((m) => m.status === filter);
  }, [materials, filter]);

  const max =
    materials.reduce((m, p) => Math.max(m, p.on_hand + p.reserved), 0) || 1;

  const visible = expanded ? filtered : filtered.slice(0, 6);

  return (
    <section
      id="material-plans"
      className="h-full rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
    >
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Inventory
          </p>
          <h2 className="text-lg font-semibold text-gray-900">Material Plans</h2>
          {filter !== "ALL" ? (
            <p className="mt-0.5 text-xs text-gray-400">
              Filtered to{" "}
              <span className="font-medium text-teal-600">
                {FILTER_LABEL[filter]}
              </span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded"
        >
          {expanded ? "Show less" : "View detail"}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </header>

      {loading && materials.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">
          Loading materials…
        </div>
      ) : null}

      <ul className="divide-y divide-gray-100">
        {visible.map((m) => {
          const total = m.on_hand + m.reserved;
          const pct = max > 0 ? Math.min(100, Math.round((total / max) * 100)) : 0;
          const isLow = m.status === "LOW_STOCK" || m.status === "OUT_OF_STOCK";
          return (
            <li key={m.id} className="py-3.5">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">
                      {m.name}
                    </span>
                    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
                      {m.sku}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {m.category}
                    <span className="mx-1.5 text-gray-300">·</span>
                    <span className="font-mono">{m.unit}</span>
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-teal-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-xs tabular-nums text-gray-500">
                      {m.on_hand} / {total}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge
                    status={m.status}
                    onClick={isLow ? () => onAction(m, "restock") : undefined}
                  />
                  <div className="flex flex-wrap justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onAction(m, "reserve")}
                      className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                      Reserve
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction(m, "release")}
                      className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                    >
                      Release
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction(m, "consume")}
                      className="rounded-md bg-teal-50 px-2 py-1 text-[10px] font-medium text-teal-700 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                    >
                      Consume
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction(m, "restock")}
                      className="rounded-md bg-teal-50 px-2 py-1 text-[10px] font-medium text-teal-700 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                    >
                      Restock
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction(m, "adjust")}
                      className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 hover:text-teal-700 hover:ring-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                    >
                      Adjust
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {!loading && filtered.length === 0 ? (
          <li className="py-10 text-center text-sm text-gray-400">
            {filter === "ALL"
              ? "No materials in inventory."
              : `No materials match the ${FILTER_LABEL[filter]} filter.`}
          </li>
        ) : null}
      </ul>
      {filtered.length > 6 ? (
        <p className="mt-3 text-center text-xs text-gray-400">
          {expanded
            ? `Showing all ${filtered.length}`
            : `Showing 6 of ${filtered.length}`}
        </p>
      ) : null}
    </section>
  );
}
