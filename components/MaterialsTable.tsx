"use client";

import type { RawMaterialView } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import type { ActionKind } from "./QuantityModal";

interface MaterialsTableProps {
  materials: RawMaterialView[];
  onAction: (material: RawMaterialView, action: ActionKind) => void;
}

const rowTone: Record<RawMaterialView["status"], string> = {
  OK: "hover:bg-slate-800/40",
  LOW_STOCK: "bg-amber-500/5 hover:bg-amber-500/10",
  OUT_OF_STOCK: "bg-rose-500/5 hover:bg-rose-500/10",
};

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function daysCellClasses(
  days: number | null,
  leadTime: number,
): string {
  if (days === null) return "text-slate-500";
  if (days < leadTime) return "text-rose-300 font-semibold";
  if (days < leadTime * 2) return "text-amber-300";
  return "text-slate-200";
}

export function MaterialsTable({ materials, onAction }: MaterialsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-slate-800 bg-slate-900/40">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th scope="col" className="px-3 py-3 text-left font-medium">SKU</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Name</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Category</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Unit</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">On Hand</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Reserved</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Available</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Days&nbsp;Until Stockout</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Reorder ≤</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Supplier</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Lead&nbsp;Time</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Status</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {materials.map((m) => (
              <tr key={m.id} className={`transition-colors ${rowTone[m.status]}`}>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-300">
                  {m.sku}
                </td>
                <td className="px-3 py-3 text-slate-100">{m.name}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-400">
                  {m.category}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-400">
                  {m.unit}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-200">
                  {formatNumber(m.on_hand)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-400">
                  {formatNumber(m.reserved)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums font-medium text-slate-100">
                  {formatNumber(m.available)}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${daysCellClasses(m.days_until_stockout, m.lead_time_days)}`}
                  title={
                    m.days_until_stockout === null
                      ? "No daily consumption recorded"
                      : `${m.days_until_stockout} day(s) at current daily consumption`
                  }
                >
                  {m.days_until_stockout === null
                    ? "∞"
                    : `${m.days_until_stockout}d`}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-500">
                  {formatNumber(m.reorder_threshold)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-300">
                  {m.supplier}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-400">
                  {m.lead_time_days}d
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <StatusBadge status={m.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
                      onClick={() => onAction(m, "consume")}
                      className="rounded-md bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      Consume
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction(m, "reserve")}
                      className="rounded-md bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      Reserve
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction(m, "release")}
                      className="rounded-md bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/30 hover:bg-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                      Release
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction(m, "restock")}
                      className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      Restock
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {materials.length === 0 ? (
              <tr>
                <td
                  colSpan={13}
                  className="px-4 py-12 text-center text-sm text-slate-500"
                >
                  No raw materials in inventory.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
