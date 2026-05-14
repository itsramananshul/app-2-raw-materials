"use client";

import { useEffect, useRef, useState } from "react";

export type ActionKind = "consume" | "reserve" | "release" | "restock";

interface QuantityModalProps {
  open: boolean;
  action: ActionKind;
  materialName: string;
  sku: string;
  unit: string;
  busy?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (quantity: number) => void;
}

const actionConfig: Record<
  ActionKind,
  { title: string; verb: string; tone: string }
> = {
  consume: {
    title: "Consume on-hand",
    verb: "Consume",
    tone: "bg-rose-500 hover:bg-rose-400 focus-visible:ring-rose-400",
  },
  reserve: {
    title: "Reserve units",
    verb: "Reserve",
    tone: "bg-sky-500 hover:bg-sky-400 focus-visible:ring-sky-400",
  },
  release: {
    title: "Release reservation",
    verb: "Release",
    tone: "bg-indigo-500 hover:bg-indigo-400 focus-visible:ring-indigo-400",
  },
  restock: {
    title: "Restock on-hand",
    verb: "Restock",
    tone: "bg-emerald-500 hover:bg-emerald-400 focus-visible:ring-emerald-400",
  },
};

export function QuantityModal({
  open,
  action,
  materialName,
  sku,
  unit,
  busy = false,
  errorMessage,
  onCancel,
  onSubmit,
}: QuantityModalProps) {
  const [value, setValue] = useState<string>("1");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setValue("1");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, action, sku]);

  if (!open) return null;

  const config = actionConfig[action];
  const parsed = Number.parseFloat(value);
  const isValid = Number.isFinite(parsed) && parsed > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quantity-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-slate-900 p-6 shadow-2xl ring-1 ring-slate-700">
        <h2
          id="quantity-modal-title"
          className="text-lg font-semibold text-slate-100"
        >
          {config.title}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          <span className="font-medium text-slate-300">{materialName}</span>
          <span className="mx-2 text-slate-600">·</span>
          <span className="font-mono text-xs text-slate-500">{sku}</span>
        </p>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValid || busy) return;
            onSubmit(parsed);
          }}
        >
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Quantity ({unit})
            </span>
            <input
              ref={inputRef}
              type="number"
              min={0}
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
              className="mt-2 w-full rounded-lg border-0 bg-slate-800 px-3 py-2 text-slate-100 ring-1 ring-inset ring-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-60"
            />
          </label>

          {errorMessage ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-inset ring-rose-500/30">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || busy}
              className={`rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${config.tone}`}
            >
              {busy ? "Working…" : config.verb}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
