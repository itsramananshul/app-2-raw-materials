"use client";

import type { ActionKind } from "./QuantityModal";

export type ActivityResult = "success" | "failure";

export interface ActivityEntry {
  id: string;
  timestamp: Date;
  action: ActionKind;
  materialName: string;
  sku: string;
  quantity: number;
  unit: string;
  result: ActivityResult;
  message?: string;
}

interface ActivityFeedProps {
  entries: ActivityEntry[];
}

const actionStyles: Record<ActionKind, string> = {
  consume: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  reserve: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  release: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/30",
  restock: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
};

const resultStyles: Record<ActivityResult, string> = {
  success: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  failure: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
};

function formatTime(ts: Date): string {
  return ts.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatQuantity(q: number): string {
  return q.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function ActivityFeed({ entries }: ActivityFeedProps) {
  return (
    <section
      aria-label="Recent activity"
      className="rounded-xl bg-slate-900/40 ring-1 ring-slate-800"
    >
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Recent Activity
          </h2>
          <p className="text-xs text-slate-500">
            Local session log. Clears when you reload the page.
          </p>
        </div>
        <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-xs font-medium text-slate-300">
          {entries.length}
        </span>
      </header>

      {entries.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-slate-500">
          No activity yet. Consume, reserve, release, or restock to log events.
        </div>
      ) : (
        <ul className="max-h-80 divide-y divide-slate-800/70 overflow-y-auto">
          {entries.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 px-4 py-2.5 text-sm"
            >
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {formatTime(e.timestamp)}
              </span>
              <span
                className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${actionStyles[e.action]}`}
              >
                {e.action}
              </span>
              <span className="min-w-0 truncate text-slate-200">
                {e.materialName}{" "}
                <span className="font-mono text-xs text-slate-500">
                  · {e.sku}
                </span>
                {e.result === "failure" && e.message ? (
                  <span className="ml-1 text-xs text-rose-300/80">
                    — {e.message}
                  </span>
                ) : null}
              </span>
              <span className="font-mono text-xs tabular-nums text-slate-400">
                ×{formatQuantity(e.quantity)} {e.unit}
              </span>
              <span
                className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${resultStyles[e.result]}`}
              >
                {e.result}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
