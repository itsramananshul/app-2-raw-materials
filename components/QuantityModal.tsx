"use client";

import { useEffect, useRef, useState } from "react";

export type ActionKind = "reserve" | "release" | "consume" | "restock" | "adjust";

interface QuantityModalProps {
  open: boolean;
  action: ActionKind;
  materialName: string;
  sku: string;
  unit?: string;
  defaultQuantity?: number;
  busy?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (quantity: number) => void;
}

const actionLabels: Record<
  ActionKind,
  { title: string; verb: string; tone: string; helper: string; allowZero: boolean }
> = {
  reserve: {
    title: "Reserve units",
    verb: "Reserve",
    tone: "bg-blue-500 hover:bg-blue-600 focus-visible:ring-blue-400",
    helper: "Move units from on-hand into the reserved bucket.",
    allowZero: false,
  },
  release: {
    title: "Release reservation",
    verb: "Release",
    tone: "bg-gray-700 hover:bg-gray-800 focus-visible:ring-gray-400",
    helper: "Move units back from reserved to available.",
    allowZero: false,
  },
  consume: {
    title: "Consume on-hand",
    verb: "Consume",
    tone: "bg-teal-500 hover:bg-teal-600 focus-visible:ring-teal-400",
    helper: "Decrement on-hand by this many units.",
    allowZero: false,
  },
  restock: {
    title: "Restock on-hand",
    verb: "Restock",
    tone: "bg-teal-500 hover:bg-teal-600 focus-visible:ring-teal-400",
    helper: "Add units to the on-hand quantity.",
    allowZero: false,
  },
  adjust: {
    title: "Adjust on-hand",
    verb: "Save",
    tone: "bg-teal-500 hover:bg-teal-600 focus-visible:ring-teal-400",
    helper: "Set the on-hand quantity to an exact value.",
    allowZero: true,
  },
};

export function QuantityModal({
  open,
  action,
  materialName,
  sku,
  unit,
  defaultQuantity,
  busy = false,
  errorMessage,
  onCancel,
  onSubmit,
}: QuantityModalProps) {
  const [value, setValue] = useState<string>("1");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      const initial =
        typeof defaultQuantity === "number" && Number.isInteger(defaultQuantity)
          ? String(Math.max(0, defaultQuantity))
          : "1";
      setValue(initial);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, action, sku, defaultQuantity]);

  if (!open) return null;

  const labels = actionLabels[action];
  const parsed = Number.parseInt(value, 10);
  const min = labels.allowZero ? 0 : 1;
  const isValid = Number.isInteger(parsed) && parsed >= min;

  const quantityLabel =
    action === "adjust"
      ? unit
        ? `New on-hand quantity (${unit})`
        : "New on-hand quantity"
      : unit
        ? `Quantity (${unit})`
        : "Quantity";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quantity-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl ring-1 ring-gray-100">
        <h2
          id="quantity-modal-title"
          className="text-lg font-semibold text-gray-900"
        >
          {labels.title}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          <span className="font-medium text-gray-800">{materialName}</span>
          <span className="mx-2 text-gray-300">·</span>
          <span className="font-mono text-xs text-gray-400">{sku}</span>
        </p>
        <p className="mt-2 text-xs text-gray-400">{labels.helper}</p>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValid || busy) return;
            onSubmit(parsed);
          }}
        >
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
              {quantityLabel}
            </span>
            <input
              ref={inputRef}
              type="number"
              min={min}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
              className="mt-2 w-full rounded-lg border-0 bg-gray-50 px-3 py-2 text-gray-900 ring-1 ring-inset ring-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
            />
          </label>

          {errorMessage ? (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || busy}
              className={`rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${labels.tone}`}
            >
              {busy ? "Working…" : labels.verb}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
