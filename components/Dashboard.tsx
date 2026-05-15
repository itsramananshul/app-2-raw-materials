"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MaterialStatus, RawMaterialView } from "@/lib/types";
import { ApiKeyManager } from "./ApiKeyManager";
import { QuantityModal, type ActionKind } from "./QuantityModal";
import { Toast, type ToastState } from "./Toast";
import { TopNav } from "./TopNav";
import type { ActivityEntry } from "./ActivityFeed";

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

// Deterministic per-SKU unit cost ($0.50–$10.00). The schema has no unit_cost
// column yet — this gives the Total Value KPI and Unit Cost column stable,
// realistic-looking values until real cost data is wired in.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function unitCostFor(sku: string): number {
  return 0.5 + (hashStr(sku) % 950) / 100;
}

function stockLevel(m: RawMaterialView): { pct: number; color: string } {
  const min = m.reorder_threshold;
  const pct = min > 0 ? Math.min(100, (m.on_hand / min) * 100) : 100;
  const color = pct >= 50 ? "#4dd9ac" : pct >= 15 ? "#f59e0b" : "#ef4444";
  return { pct, color };
}

const STATUS_PILL: Record<
  MaterialStatus,
  { label: string; bg: string; fg: string }
> = {
  OK: { label: "OK", bg: "#c6f6d5", fg: "#276749" },
  LOW_STOCK: { label: "Low", bg: "#fefcbf", fg: "#744210" },
  OUT_OF_STOCK: { label: "Critical", bg: "#fed7d7", fg: "#9b2c2c" },
};

const TABLE_COLS: { key: string; label: string; align?: "right" | "left" }[] = [
  { key: "name", label: "Material Name" },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category" },
  { key: "stock", label: "Stock Level" },
  { key: "on_hand", label: "On Hand", align: "right" },
  { key: "min", label: "Minimum", align: "right" },
  { key: "cost", label: "Unit Cost", align: "right" },
  { key: "status", label: "Status" },
];

export function Dashboard({ instanceName }: DashboardProps) {
  const [materials, setMaterials] = useState<RawMaterialView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [modal, setModal] = useState<ModalState | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [, setActivity] = useState<ActivityEntry[]>([]);
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
    const totalItems = list.length;
    const lowStock = list.filter(
      (m) => m.reorder_threshold > 0 && m.on_hand < m.reorder_threshold,
    ).length;
    const critical = list.filter(
      (m) =>
        m.reorder_threshold > 0 &&
        m.on_hand / m.reorder_threshold < 0.15,
    ).length;
    const totalValue = list.reduce(
      (sum, m) => sum + m.on_hand * unitCostFor(m.sku),
      0,
    );
    return { totalItems, lowStock, critical, totalValue };
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const list = materials ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q),
    );
  }, [materials, search]);

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

  return (
    <div style={{ background: "#f0f4f8", minHeight: "100vh" }}>
      <TopNav instanceName={instanceName} />

      {/* Sub-header */}
      <div
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "10px 20px",
        }}
        className="flex items-center gap-3"
      >
        <div className="flex items-center gap-2">
          <h1 style={{ fontSize: 15, fontWeight: 600, color: "#1a202c" }}>
            Raw Materials
          </h1>
          <span
            style={{
              background: "#edf2f7",
              color: "#4a5568",
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 12,
              fontWeight: 600,
            }}
          >
            {materials === null ? "—" : materials.length}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input
            type="search"
            placeholder="Search materials, SKU, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: 180,
              background: "#f1f5f9",
              border: "1px solid transparent",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              color: "#1a202c",
              outline: "none",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#cbd5e0")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
          />
          <button
            type="button"
            style={{
              border: "1px solid #cbd5e0",
              background: "#ffffff",
              color: "#4a5568",
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
            onClick={() => setApiKeysOpen(true)}
            title="Manage API keys"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="7.5" cy="15.5" r="5.5" />
              <path d="m21 2-9.6 9.6" />
              <path d="m15.5 7.5 3 3L22 7l-3-3" />
            </svg>
            API Keys
          </button>
          <button
            type="button"
            style={{
              background: "#4dd9ac",
              color: "#0f1e2e",
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              border: "none",
            }}
          >
            + Add Material
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div
        style={{
          background: "#f0f4f8",
          padding: "14px 20px",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <KpiCard label="Total Items" value={String(stats.totalItems)} />
        <KpiCard
          label="Low Stock"
          value={String(stats.lowStock)}
          valueColor="#f59e0b"
        />
        <KpiCard
          label="Critical"
          value={String(stats.critical)}
          valueColor="#ef4444"
        />
        <KpiCard
          label="Total Value"
          value={`$${(stats.totalValue / 1000).toFixed(1)}k`}
        />
      </div>

      {/* Table */}
      <div style={{ padding: "0 20px 14px" }}>
        {loadError ? (
          <div
            style={{
              background: "#fed7d7",
              color: "#9b2c2c",
              padding: "10px 14px",
              borderRadius: 6,
              marginBottom: 10,
              fontSize: 13,
            }}
          >
            Failed to load materials: {loadError}
          </div>
        ) : null}

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ background: "#f7fafc" }}>
                  {TABLE_COLS.map((c) => (
                    <th
                      key={c.key}
                      style={{
                        padding: "10px 14px",
                        textAlign: c.align ?? "left",
                        color: "#718096",
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        fontWeight: 600,
                        borderBottom: "1px solid #e2e8f0",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {materials === null ? (
                  <tr>
                    <td
                      colSpan={TABLE_COLS.length}
                      style={{ padding: 24, textAlign: "center", color: "#a0aec0" }}
                    >
                      Loading materials…
                    </td>
                  </tr>
                ) : filteredMaterials.length === 0 ? (
                  <tr>
                    <td
                      colSpan={TABLE_COLS.length}
                      style={{ padding: 24, textAlign: "center", color: "#a0aec0" }}
                    >
                      No materials match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredMaterials.map((m) => {
                    const { pct, color } = stockLevel(m);
                    const cost = unitCostFor(m.sku);
                    const pill = STATUS_PILL[m.status];
                    return (
                      <tr
                        key={m.id}
                        onClick={() => handleAction(m, "adjust")}
                        style={{
                          cursor: "pointer",
                          borderBottom: "1px solid #edf2f7",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#f7fafc")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <td style={{ padding: "10px 14px", color: "#1a202c", fontWeight: 500 }}>
                          {m.name}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            color: "#718096",
                            fontFamily:
                              'ui-monospace, SFMono-Regular, Menlo, monospace',
                          }}
                        >
                          {m.sku}
                        </td>
                        <td style={{ padding: "10px 14px", color: "#4a5568" }}>
                          {m.category}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div
                            style={{
                              width: 70,
                              height: 6,
                              background: "#edf2f7",
                              borderRadius: 4,
                              overflow: "hidden",
                            }}
                            aria-label={`${Math.round(pct)}% of minimum`}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                background: color,
                                transition: "width 200ms ease-out",
                              }}
                            />
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            textAlign: "right",
                            color: "#1a202c",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {m.on_hand} <span style={{ color: "#a0aec0" }}>{m.unit}</span>
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            textAlign: "right",
                            color: "#718096",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {m.reorder_threshold}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            textAlign: "right",
                            color: "#1a202c",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          ${cost.toFixed(2)}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span
                            style={{
                              background: pill.bg,
                              color: pill.fg,
                              padding: "2px 10px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {pill.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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

function KpiCard({
  label,
  value,
  valueColor = "#1a202c",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: "12px 16px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#718096",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: valueColor,
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
