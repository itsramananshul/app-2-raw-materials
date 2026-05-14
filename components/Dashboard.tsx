"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RawMaterialView } from "@/lib/types";
import { ActivityFeed, type ActivityEntry } from "./ActivityFeed";
import { ConnectionStatus, type ConnectionState } from "./ConnectionStatus";
import { MaterialsTable } from "./MaterialsTable";
import { QuantityModal, type ActionKind } from "./QuantityModal";
import { StatCard } from "./StatCard";
import { Toast, type ToastState } from "./Toast";

interface DashboardProps {
  instanceName: string;
}

interface ModalState {
  material: RawMaterialView;
  action: ActionKind;
}

const POLL_INTERVAL_MS = 5000;
const STALE_THRESHOLD_MS = 15000;
const ACTIVITY_MAX = 50;

const actionVerbPast: Record<ActionKind, string> = {
  consume: "Consumed",
  reserve: "Reserved",
  release: "Released",
  restock: "Restocked",
};

const actionVerbFail: Record<ActionKind, string> = {
  consume: "Consume failed",
  reserve: "Reserve failed",
  release: "Release failed",
  restock: "Restock failed",
};

function newActivityId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function Dashboard({ instanceName }: DashboardProps) {
  const [materials, setMaterials] = useState<RawMaterialView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [lastSuccessAt, setLastSuccessAt] = useState<Date | null>(null);
  const [lastFetchOk, setLastFetchOk] = useState<boolean>(true);
  const [now, setNow] = useState<Date>(new Date());

  const [toast, setToast] = useState<ToastState | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchMaterials = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/materials", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data: RawMaterialView[] = await res.json();
      setMaterials(data);
      setLoadError(null);
      setLastFetchOk(true);
      setLastSuccessAt(new Date());
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setLastFetchOk(false);
      setLoadError(
        err instanceof Error ? err.message : "Failed to load materials",
      );
    }
  }, []);

  useEffect(() => {
    void fetchMaterials();
    const pollId = setInterval(() => {
      void fetchMaterials();
    }, POLL_INTERVAL_MS);
    const tickId = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(pollId);
      clearInterval(tickId);
      abortRef.current?.abort();
    };
  }, [fetchMaterials]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const connectionState: ConnectionState = useMemo(() => {
    if (!lastSuccessAt) return "connecting";
    const age = now.getTime() - lastSuccessAt.getTime();
    if (age > STALE_THRESHOLD_MS) return "stale";
    if (!lastFetchOk) return "reconnecting";
    return "live";
  }, [lastSuccessAt, lastFetchOk, now]);

  const lastRefreshedAgo = useMemo(() => {
    if (!lastSuccessAt) return null;
    const seconds = Math.max(
      0,
      Math.floor((now.getTime() - lastSuccessAt.getTime()) / 1000),
    );
    return seconds;
  }, [lastSuccessAt, now]);

  const stats = useMemo(() => {
    const list = materials ?? [];
    const totalSkus = list.length;
    const totalOnHand = list.reduce((sum, m) => sum + m.on_hand, 0);
    const criticalMaterials = list.filter(
      (m) => m.status === "OUT_OF_STOCK",
    ).length;
    const lowStockAlerts = list.filter((m) => m.status === "LOW_STOCK").length;
    return { totalSkus, totalOnHand, criticalMaterials, lowStockAlerts };
  }, [materials]);

  const appendActivity = useCallback((entry: ActivityEntry) => {
    setActivity((prev) => [entry, ...prev].slice(0, ACTIVITY_MAX));
  }, []);

  const handleAction = useCallback(
    (material: RawMaterialView, action: ActionKind) => {
      setActionError(null);
      setModal({ material, action });
    },
    [],
  );

  const handleCloseModal = useCallback(() => {
    if (actionBusy) return;
    setModal(null);
    setActionError(null);
  }, [actionBusy]);

  const handleSubmit = useCallback(
    async (quantity: number) => {
      if (!modal) return;
      setActionBusy(true);
      setActionError(null);

      const { material, action } = modal;

      try {
        const res = await fetch(`/api/materials/${material.id}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity }),
        });
        const body = (await res.json().catch(() => null)) as
          | {
              success?: boolean;
              error?: string;
              material?: RawMaterialView;
            }
          | null;
        const ok = res.ok && body?.success === true;

        if (!ok) {
          throw new Error(body?.error ?? `Request failed (HTTP ${res.status})`);
        }

        appendActivity({
          id: newActivityId(),
          timestamp: new Date(),
          action,
          materialName: material.name,
          sku: material.sku,
          quantity,
          unit: material.unit,
          result: "success",
        });
        setToast({
          id: Date.now(),
          kind: "success",
          message: `${actionVerbPast[action]} ${formatNumber(quantity)} ${material.unit} of ${material.name}.`,
        });
        setModal(null);
        void fetchMaterials();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Action failed";
        appendActivity({
          id: newActivityId(),
          timestamp: new Date(),
          action,
          materialName: material.name,
          sku: material.sku,
          quantity,
          unit: material.unit,
          result: "failure",
          message,
        });
        setActionError(message);
        setToast({
          id: Date.now(),
          kind: "error",
          message: `${actionVerbFail[action]}: ${message}`,
        });
      } finally {
        setActionBusy(false);
      }
    },
    [modal, fetchMaterials, appendActivity],
  );

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-8">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">
              Raw Materials Inventory
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-50">
              {instanceName}{" "}
              <span className="text-slate-500">— Raw Materials</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Standalone raw-materials instance. Auto-refreshes every 5 seconds.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-full bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-inset ring-slate-700"
              title="Set via INSTANCE_NAME env var. Read-only in the UI."
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 text-slate-500"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 1 1 8 0v3" />
              </svg>
              Current Instance: {instanceName}
            </span>
            <ConnectionStatus state={connectionState} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>
            <span className="text-slate-500">Last refreshed:</span>{" "}
            <span className="text-slate-300 tabular-nums">
              {lastSuccessAt ? lastSuccessAt.toLocaleTimeString() : "—"}
            </span>
            {lastRefreshedAgo !== null ? (
              <span className="ml-1 text-slate-500">
                ({lastRefreshedAgo}s ago)
              </span>
            ) : null}
          </span>
          <span className="text-slate-700">·</span>
          <span>
            Polling every {Math.round(POLL_INTERVAL_MS / 1000)} s · stale after{" "}
            {Math.round(STALE_THRESHOLD_MS / 1000)} s
          </span>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total SKUs" value={stats.totalSkus} />
        <StatCard
          label="Total On Hand"
          value={formatNumber(stats.totalOnHand)}
          tone="success"
          hint="Sum across all units"
        />
        <StatCard
          label="Critical Materials"
          value={stats.criticalMaterials}
          tone={stats.criticalMaterials > 0 ? "danger" : "default"}
          hint={
            stats.criticalMaterials > 0
              ? "OUT_OF_STOCK count"
              : "Nothing out of stock"
          }
        />
        <StatCard
          label="Low Stock Alerts"
          value={stats.lowStockAlerts}
          tone={stats.lowStockAlerts > 0 ? "warning" : "default"}
          hint={
            stats.lowStockAlerts > 0
              ? "LOW_STOCK count"
              : "All SKUs healthy"
          }
        />
      </section>

      {loadError ? (
        <div className="mt-6 rounded-md bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ring-1 ring-inset ring-rose-500/30">
          Failed to load materials: {loadError}
        </div>
      ) : null}

      <section className="mt-6">
        {materials === null && !loadError ? (
          <div className="rounded-xl bg-slate-900/40 px-4 py-12 text-center text-sm text-slate-500 ring-1 ring-slate-800">
            Loading raw materials…
          </div>
        ) : (
          <MaterialsTable
            materials={materials ?? []}
            onAction={handleAction}
          />
        )}
      </section>

      <section className="mt-6">
        <ActivityFeed entries={activity} />
      </section>

      <QuantityModal
        open={modal !== null}
        action={modal?.action ?? "reserve"}
        materialName={modal?.material.name ?? ""}
        sku={modal?.material.sku ?? ""}
        unit={modal?.material.unit ?? ""}
        busy={actionBusy}
        errorMessage={actionError}
        onCancel={handleCloseModal}
        onSubmit={handleSubmit}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </main>
  );
}
