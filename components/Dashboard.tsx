"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RawMaterialView } from "@/lib/types";
import { ActivityFeed, type ActivityEntry } from "./ActivityFeed";
import { ApiKeyManager } from "./ApiKeyManager";
import { ComingSoon } from "./ComingSoon";
import { DonutChart } from "./DonutChart";
import { FilterDropdown } from "./FilterDropdown";
import { MaterialPlans, type StatusFilter } from "./MaterialPlans";
import { MetricCard } from "./MetricCard";
import { QuantityModal, type ActionKind } from "./QuantityModal";
import { Toast, type ToastState } from "./Toast";
import { TopNav, type NavView } from "./TopNav";
import { TopMaterials } from "./TopMaterials";

interface DashboardProps {
  instanceName: string;
}

interface ModalState {
  material: RawMaterialView;
  action: ActionKind;
  defaultQuantity?: number;
}

const POLL_INTERVAL_MS = 5000;
const ACTIVITY_MAX = 50;

const actionVerbPast: Record<ActionKind, string> = {
  reserve: "Reserved",
  release: "Released",
  consume: "Consumed",
  restock: "Restocked",
  adjust: "Adjusted",
};

const actionVerbFail: Record<ActionKind, string> = {
  reserve: "Reserve failed",
  release: "Release failed",
  consume: "Consume failed",
  restock: "Restock failed",
  adjust: "Adjust failed",
};

function newActivityId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const COMING_SOON_COPY: Record<
  Exclude<NavView, "dashboard">,
  { title: string; description: string }
> = {
  materials: {
    title: "Materials — coming soon",
    description:
      "A full raw-materials catalog editor with bulk upload, categories, and per-supplier pricing.",
  },
  suppliers: {
    title: "Suppliers — coming soon",
    description:
      "Supplier directory, contact details, lead-time tracking, and rating history.",
  },
  "purchase-orders": {
    title: "Purchase Orders — coming soon",
    description:
      "Create, approve, and track purchase orders, plus incoming-stock forecasting.",
  },
  "inventory-plan": {
    title: "Inventory Plan — coming soon",
    description:
      "Demand forecasting and automated reorder suggestions based on consumption history.",
  },
};

const NAV_HEADER_LABEL: Record<Exclude<NavView, "dashboard">, string> = {
  materials: "Materials",
  suppliers: "Suppliers",
  "purchase-orders": "Purchase Orders",
  "inventory-plan": "Inventory Plan",
};

function scrollToPlans() {
  const el = document.getElementById("material-plans");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Dashboard({ instanceName }: DashboardProps) {
  const [materials, setMaterials] = useState<RawMaterialView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [view, setView] = useState<NavView>("dashboard");
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [expanded, setExpanded] = useState(false);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [apiKeysOpen, setApiKeysOpen] = useState(false);

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
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setLoadError(
        err instanceof Error ? err.message : "Failed to load materials",
      );
    }
  }, []);

  useEffect(() => {
    void fetchMaterials();
    const id = setInterval(() => {
      void fetchMaterials();
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetchMaterials]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const stats = useMemo(() => {
    const list = materials ?? [];
    const totalMaterials = list.length;
    const lowStockAlerts = list.filter((m) => m.status !== "OK").length;
    const inStock = list.filter((m) => m.status === "OK").length;
    const lowOnly = list.filter((m) => m.status === "LOW_STOCK").length;
    const outOnly = list.filter((m) => m.status === "OUT_OF_STOCK").length;
    const suppliersActive = new Set(
      list.map((m) => m.supplier).filter((s) => typeof s === "string" && s.length > 0),
    ).size;
    return {
      totalMaterials,
      lowStockAlerts,
      inStock,
      lowOnly,
      outOnly,
      suppliersActive,
    };
  }, [materials]);

  const filterCounts: Record<StatusFilter, number> = useMemo(
    () => ({
      ALL: stats.totalMaterials,
      OK: stats.inStock,
      LOW_STOCK: stats.lowOnly,
      OUT_OF_STOCK: stats.outOnly,
    }),
    [stats],
  );

  const appendActivity = useCallback((entry: ActivityEntry) => {
    setActivity((prev) => [entry, ...prev].slice(0, ACTIVITY_MAX));
  }, []);

  const handleAction = useCallback(
    (material: RawMaterialView, action: ActionKind) => {
      setActionError(null);
      setModal({
        material,
        action,
        defaultQuantity: action === "adjust" ? material.on_hand : undefined,
      });
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
          message: `${actionVerbPast[action]} ${quantity} ${material.unit} × ${material.name}.`,
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

  const handleViewLowStock = useCallback(() => {
    setFilter("LOW_STOCK");
    setExpanded(true);
    setTimeout(scrollToPlans, 50);
  }, []);

  const handleViewAll = useCallback(() => {
    setFilter("ALL");
    setExpanded(true);
    setTimeout(scrollToPlans, 50);
  }, []);

  return (
    <div>
      <TopNav
        instanceName={instanceName}
        currentView={view}
        onChangeView={(v) => {
          setView(v);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onOpenApiKeys={() => setApiKeysOpen(true)}
      />

      <main className="mx-auto max-w-7xl px-6 py-6">
        {view !== "dashboard" ? (
          <>
            <div className="mb-6 flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {NAV_HEADER_LABEL[view]}
              </p>
              <h1 className="text-2xl font-bold text-gray-900">
                {NAV_HEADER_LABEL[view]}
              </h1>
            </div>
            <ComingSoon
              title={COMING_SOON_COPY[view].title}
              description={COMING_SOON_COPY[view].description}
              onBack={() => setView("dashboard")}
            />
          </>
        ) : (
          <>
            <div className="mb-6 flex items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Overview
                </p>
                <h1 className="text-2xl font-bold text-gray-900">
                  {instanceName} Dashboard
                </h1>
              </div>
              <FilterDropdown
                value={filter}
                counts={filterCounts}
                onChange={setFilter}
              />
            </div>

            {loadError ? (
              <div className="mb-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
                Failed to load materials: {loadError}
              </div>
            ) : null}

            <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Total Materials"
                value={stats.totalMaterials}
                onViewDetail={handleViewAll}
              />
              <MetricCard
                label="Low-Stock Alerts"
                value={stats.lowStockAlerts}
                hint={
                  stats.lowStockAlerts > 0 ? "Needs attention" : "All healthy"
                }
                onViewDetail={handleViewLowStock}
              />
              <MetricCard
                label="Pending Orders"
                value={0}
                hint="No upcoming orders"
              />
              <MetricCard
                label="Suppliers Active"
                value={stats.suppliersActive}
                hint="Across all materials"
              />
            </section>

            <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <MaterialPlans
                  materials={materials ?? []}
                  loading={materials === null}
                  filter={filter}
                  expanded={expanded}
                  onAction={handleAction}
                  onToggleExpand={() => setExpanded((v) => !v)}
                />
              </div>
              <div className="flex flex-col gap-4 lg:col-span-2">
                <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                  <header className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Distribution
                      </p>
                      <h2 className="text-lg font-semibold text-gray-900">
                        Stock Status
                      </h2>
                    </div>
                  </header>
                  <DonutChart
                    total={stats.totalMaterials}
                    centerLabel="SKUs"
                    slices={[
                      { label: "In Stock", value: stats.inStock, hex: "#14b8a6" },
                      { label: "Low Stock", value: stats.lowOnly, hex: "#f59e0b" },
                      {
                        label: "Out of Stock",
                        value: stats.outOnly,
                        hex: "#ef4444",
                      },
                    ]}
                  />
                </section>
                <ActivityFeed entries={activity} />
              </div>
            </section>

            <section className="mb-6">
              <TopMaterials
                materials={materials ?? []}
                onAction={handleAction}
                onViewAll={handleViewAll}
              />
            </section>
          </>
        )}
      </main>

      <QuantityModal
        open={modal !== null}
        action={modal?.action ?? "reserve"}
        materialName={modal?.material.name ?? ""}
        sku={modal?.material.sku ?? ""}
        unit={modal?.material.unit}
        defaultQuantity={modal?.defaultQuantity}
        busy={actionBusy}
        errorMessage={actionError}
        onCancel={handleCloseModal}
        onSubmit={handleSubmit}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />

      <ApiKeyManager
        open={apiKeysOpen}
        onClose={() => setApiKeysOpen(false)}
      />
    </div>
  );
}
