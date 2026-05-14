"use client";

import type { RawMaterialView } from "@/lib/types";
import type { ActionKind } from "./QuantityModal";

interface TopMaterialsProps {
  materials: RawMaterialView[];
  onAction: (material: RawMaterialView, action: ActionKind) => void;
  onViewAll: () => void;
}

export function TopMaterials({ materials, onAction, onViewAll }: TopMaterialsProps) {
  const top = [...materials].sort((a, b) => b.on_hand - a.on_hand).slice(0, 6);

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Catalog
          </p>
          <h2 className="text-lg font-semibold text-gray-900">Top Materials</h2>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded"
        >
          View all
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {top.map((m) => (
          <div
            key={m.id}
            className="group rounded-lg border border-gray-100 bg-gray-50 p-3 transition-colors hover:border-teal-200 hover:bg-teal-50/50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-white text-teal-600 shadow-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7"
                aria-hidden
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <p
              className="mt-3 truncate text-sm font-medium text-gray-900"
              title={m.name}
            >
              {m.name}
            </p>
            <p className="truncate font-mono text-[10px] text-gray-400">
              {m.sku}
            </p>
            <p className="mt-1.5 text-xs text-gray-500">
              <span className="font-medium text-gray-700">{m.on_hand}</span>{" "}
              <span className="font-mono text-[10px] text-gray-400">{m.unit}</span>{" "}
              on hand
            </p>
            <div className="mt-2 flex gap-1">
              <button
                type="button"
                onClick={() => onAction(m, "restock")}
                className="flex-1 rounded-md bg-teal-50 px-2 py-1 text-[10px] font-medium text-teal-700 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              >
                Restock
              </button>
              <button
                type="button"
                onClick={() => onAction(m, "adjust")}
                className="flex-1 rounded-md bg-white px-2 py-1 text-[10px] font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 hover:text-teal-700 hover:ring-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              >
                Adjust
              </button>
            </div>
          </div>
        ))}
        {top.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-gray-400">
            No materials yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}
