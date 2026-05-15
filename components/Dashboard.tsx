"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MaterialStatus, RawMaterialView } from "@/lib/types";
import { ApiKeyManager } from "./ApiKeyManager";
import { QuantityModal, type ActionKind } from "./QuantityModal";
import { Toast, type ToastState } from "./Toast";
import { TopNav, type NavKey } from "./TopNav";
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

function stockPercent(m: RawMaterialView): number {
  // Capacity is not a schema column. Use 2× the reorder threshold as the
  // conceptual "full" mark so a healthy stock at 1× minimum shows ~50%.
  const cap = Math.max(m.on_hand, 2 * Math.max(m.reorder_threshold, 1));
  return Math.max(0, Math.min(100, (m.on_hand / cap) * 100));
}

function stockColor(pct: number): string {
  if (pct >= 50) return "#0d9488";
  if (pct >= 15) return "#f59e0b";
  return "#ef4444";
}

function isCritical(m: RawMaterialView): boolean {
  return m.reorder_threshold > 0 && m.on_hand / m.reorder_threshold < 0.15;
}
function isLow(m: RawMaterialView): boolean {
  return m.reorder_threshold > 0 && m.on_hand < m.reorder_threshold;
}

const STATUS_PILL: Record<
  MaterialStatus,
  { label: string; bg: string; fg: string }
> = {
  OK: { label: "OK", bg: "#dcfce7", fg: "#166534" },
  LOW_STOCK: { label: "Low", bg: "#fef3c7", fg: "#854d0e" },
  OUT_OF_STOCK: { label: "Critical", bg: "#fee2e2", fg: "#991b1b" },
};

type StatusFilter = "ALL" | "LOW" | "CRITICAL";

const TABLE_COLS: { key: string; label: string; align?: "right" | "left" }[] = [
  { key: "name", label: "Material" },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category" },
  { key: "stock", label: "Stock Level" },
  { key: "on_hand", label: "On Hand", align: "right" },
  { key: "min", label: "Minimum", align: "right" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Actions", align: "right" },
];

export function Dashboard({ instanceName }: DashboardProps) {
  const [materials, setMaterials] = useState<RawMaterialView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeNav, setActiveNav] = useState<NavKey>("raw-materials");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [, setActivity] = useState<ActivityEntry[]>([]);
  const [apiKeysOpen, setApiKeysOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);

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
    const totalSkus = list.length;
    const lowCount = list.filter(isLow).length;
    const criticalCount = list.filter(isCritical).length;
    const totalOnHand = list.reduce((s, m) => s + m.on_hand, 0);
    return { totalSkus, lowCount, criticalCount, totalOnHand };
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const list = materials ?? [];
    const q = search.trim().toLowerCase();
    let scoped = list;
    if (q) {
      scoped = scoped.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.sku.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q),
      );
    }
    if (statusFilter === "LOW") return scoped.filter(isLow);
    if (statusFilter === "CRITICAL") return scoped.filter(isCritical);
    return scoped;
  }, [materials, search, statusFilter]);

  const breakdown = useMemo(() => {
    const list = materials ?? [];
    const byCat = new Map<string, { count: number; onHand: number }>();
    for (const m of list) {
      const cur = byCat.get(m.category) ?? { count: 0, onHand: 0 };
      cur.count += 1;
      cur.onHand += m.on_hand;
      byCat.set(m.category, cur);
    }
    return Array.from(byCat.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.onHand - a.onHand);
  }, [materials]);

  const appendActivity = useCallback((entry: ActivityEntry) => {
    setActivity((prev) => [entry, ...prev].slice(0, ACTIVITY_MAX));
  }, []);

  const openAction = useCallback(
    (material: RawMaterialView, action: ActionKind) => {
      setActionError(null);
      const defaultQty =
        action === "adjust"
          ? material.on_hand
          : action === "restock"
            ? Math.max(0, material.reorder_threshold * 2 - material.on_hand)
            : undefined;
      setModal({ material, action, defaultQuantity: defaultQty });
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

  const scrollToTable = useCallback(() => {
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 30);
  }, []);

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <TopNav
        instanceName={instanceName}
        activeNav={activeNav}
        onChangeNav={setActiveNav}
        onOpenApiKeys={() => setApiKeysOpen(true)}
      />

      {activeNav === "dashboard" ? (
        <OverviewView
          materials={materials}
          stats={stats}
          onOpenBreakdown={() => setBreakdownOpen(true)}
        />
      ) : activeNav === "work-orders" ? (
        <WorkOrdersView
          materials={materials}
          onAdjust={(m) => openAction(m, "adjust")}
          onReorder={(m) => openAction(m, "restock")}
        />
      ) : activeNav === "vendors" ? (
        <VendorsView materials={materials} />
      ) : activeNav === "reports" ? (
        <ReportsView materials={materials} stats={stats} />
      ) : (
        <main style={{ padding: "20px", maxWidth: 1400, margin: "0 auto" }}>
          {/* KPI row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <KpiCard
              label="Total SKUs"
              value={stats.totalSkus}
              detail="across all categories"
            />
            <KpiCard
              label="Low Stock"
              value={stats.lowCount}
              valueColor="#f59e0b"
              detail="View detail →"
              onClick={() => {
                setStatusFilter("LOW");
                scrollToTable();
              }}
            />
            <KpiCard
              label="Critical"
              value={stats.criticalCount}
              valueColor="#ef4444"
              detail="View detail →"
              onClick={() => {
                setStatusFilter("CRITICAL");
                scrollToTable();
              }}
            />
            <KpiCard
              label="Total On Hand"
              value={stats.totalOnHand.toLocaleString()}
              detail="View breakdown →"
              onClick={() => setBreakdownOpen(true)}
            />
          </div>

          {/* Table card */}
          <div
            ref={tableRef}
            style={{
              marginTop: 16,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                Raw Materials
              </h2>
              <span
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 12,
                }}
              >
                {filteredMaterials.length} of {materials?.length ?? 0}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <StatusFilterPill
                  active={statusFilter === "ALL"}
                  onClick={() => setStatusFilter("ALL")}
                >
                  All
                </StatusFilterPill>
                <StatusFilterPill
                  active={statusFilter === "LOW"}
                  onClick={() => setStatusFilter("LOW")}
                >
                  Low ({stats.lowCount})
                </StatusFilterPill>
                <StatusFilterPill
                  active={statusFilter === "CRITICAL"}
                  onClick={() => setStatusFilter("CRITICAL")}
                >
                  Critical ({stats.criticalCount})
                </StatusFilterPill>
                <input
                  type="search"
                  placeholder="Search materials, SKU, category…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: 220,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    color: "#0f172a",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
                />
              </div>
            </div>

            {loadError ? (
              <div
                style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  padding: "10px 16px",
                  fontSize: 12,
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                Failed to load materials: {loadError}
              </div>
            ) : null}

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {TABLE_COLS.map((c) => (
                      <th
                        key={c.key}
                        style={{
                          padding: "10px 14px",
                          textAlign: c.align ?? "left",
                          color: "#64748b",
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
                        style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}
                      >
                        Loading materials…
                      </td>
                    </tr>
                  ) : filteredMaterials.length === 0 ? (
                    <tr>
                      <td
                        colSpan={TABLE_COLS.length}
                        style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}
                      >
                        No materials match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((m) => {
                      const pct = stockPercent(m);
                      const color = stockColor(pct);
                      const pill = STATUS_PILL[m.status];
                      const expanded = expandedId === m.id;
                      const showReorder = isLow(m) || isCritical(m);
                      return (
                        <Row
                          key={m.id}
                          m={m}
                          pct={pct}
                          color={color}
                          pill={pill}
                          expanded={expanded}
                          showReorder={showReorder}
                          onToggle={() =>
                            setExpandedId((cur) => (cur === m.id ? null : m.id))
                          }
                          onAdjust={() => openAction(m, "adjust")}
                          onReorder={() => openAction(m, "restock")}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

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

      <BreakdownModal
        open={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        rows={breakdown}
        total={stats.totalOnHand}
      />
    </div>
  );
}

// ─── UI bits ──────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  valueColor = "#0f172a",
  detail,
  onClick,
}: {
  label: string;
  value: number | string;
  valueColor?: string;
  detail?: string;
  onClick?: () => void;
}) {
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "14px 16px",
        textAlign: "left",
        cursor: clickable ? "pointer" : "default",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (clickable) {
          e.currentTarget.style.borderColor = "#cbd5e1";
          e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.06)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#e2e8f0";
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: valueColor,
          marginTop: 6,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {detail ? (
        <div
          style={{
            fontSize: 11,
            color: clickable ? "#0d9488" : "#94a3b8",
            marginTop: 4,
          }}
        >
          {detail}
        </div>
      ) : null}
    </button>
  );
}

function StatusFilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "#0d9488" : "#ffffff",
        color: active ? "#ffffff" : "#475569",
        border: `1px solid ${active ? "#0d9488" : "#e2e8f0"}`,
        padding: "6px 12px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 120ms ease",
      }}
    >
      {children}
    </button>
  );
}

function Row({
  m,
  pct,
  color,
  pill,
  expanded,
  showReorder,
  onToggle,
  onAdjust,
  onReorder,
}: {
  m: RawMaterialView;
  pct: number;
  color: string;
  pill: { label: string; bg: string; fg: string };
  expanded: boolean;
  showReorder: boolean;
  onToggle: () => void;
  onAdjust: () => void;
  onReorder: () => void;
}) {
  return (
    <>
      <tr
        style={{
          borderBottom: "1px solid #f1f5f9",
          cursor: "pointer",
        }}
        onClick={onToggle}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "#f8fafc")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "transparent")
        }
      >
        <td style={{ padding: "10px 14px", color: "#0f172a", fontWeight: 500 }}>
          <span
            style={{
              display: "inline-block",
              width: 14,
              color: "#94a3b8",
              fontSize: 10,
            }}
            aria-hidden
          >
            {expanded ? "▾" : "▸"}
          </span>
          {m.name}
        </td>
        <td
          style={{
            padding: "10px 14px",
            color: "#64748b",
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {m.sku}
        </td>
        <td style={{ padding: "10px 14px", color: "#475569" }}>{m.category}</td>
        <td style={{ padding: "10px 14px" }}>
          <div
            style={{
              width: 80,
              height: 6,
              background: "#f1f5f9",
              borderRadius: 4,
              overflow: "hidden",
            }}
            aria-label={`${Math.round(pct)}% of capacity`}
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
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
            {Math.round(pct)}%
          </div>
        </td>
        <td
          style={{
            padding: "10px 14px",
            textAlign: "right",
            color: "#0f172a",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {m.on_hand} <span style={{ color: "#94a3b8" }}>{m.unit}</span>
        </td>
        <td
          style={{
            padding: "10px 14px",
            textAlign: "right",
            color: "#64748b",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {m.reorder_threshold}
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
        <td
          style={{
            padding: "10px 14px",
            textAlign: "right",
            whiteSpace: "nowrap",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onAdjust}
            style={rowBtnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e2e8f0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#f1f5f9")}
          >
            Adjust
          </button>
          {showReorder ? (
            <button
              type="button"
              onClick={onReorder}
              style={{
                ...rowBtnStyle,
                marginLeft: 6,
                background: "#0d9488",
                color: "#ffffff",
                border: "1px solid #0d9488",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#0f766e")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#0d9488")}
            >
              Reorder
            </button>
          ) : null}
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={TABLE_COLS.length} style={{ padding: 0 }}>
            <div
              style={{
                background: "#f8fafc",
                padding: "12px 18px 16px 32px",
                borderBottom: "1px solid #f1f5f9",
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 16,
                fontSize: 12,
              }}
            >
              <Detail label="Supplier" value={m.supplier || "—"} />
              <Detail label="Lead time" value={`${m.lead_time_days}d`} />
              <Detail label="Daily burn" value={`${m.daily_consumption} ${m.unit}/day`} />
              <Detail
                label="Days until stockout"
                value={
                  m.days_until_stockout === null
                    ? "—"
                    : `${m.days_until_stockout}d`
                }
              />
              <Detail label="Available" value={`${m.available} ${m.unit}`} />
              <Detail label="Reserved" value={`${m.reserved} ${m.unit}`} />
              <Detail
                label="Updated"
                value={
                  m.updated_at
                    ? new Date(m.updated_at).toLocaleString()
                    : "—"
                }
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

const rowBtnStyle: React.CSSProperties = {
  background: "#f1f5f9",
  border: "1px solid #e2e8f0",
  color: "#0f172a",
  padding: "4px 10px",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 120ms ease",
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#94a3b8",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ color: "#0f172a", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function BreakdownModal({
  open,
  onClose,
  rows,
  total,
}: {
  open: boolean;
  onClose: () => void;
  rows: { category: string; count: number; onHand: number }[];
  total: number;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          padding: 0,
          width: "min(520px, 90vw)",
          maxHeight: "80vh",
          overflow: "hidden",
          boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Inventory breakdown
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>
              By category · {total.toLocaleString()} units total
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: "auto", maxHeight: "calc(80vh - 80px)" }}>
          {rows.length === 0 ? (
            <div style={{ padding: 24, color: "#94a3b8", fontSize: 12, textAlign: "center" }}>
              No materials loaded.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 20px",
                      color: "#64748b",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontWeight: 600,
                    }}
                  >
                    Category
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 20px",
                      color: "#64748b",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontWeight: 600,
                    }}
                  >
                    SKUs
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 20px",
                      color: "#64748b",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontWeight: 600,
                    }}
                  >
                    On Hand
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 20px",
                      color: "#64748b",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontWeight: 600,
                    }}
                  >
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const share = total === 0 ? 0 : (r.onHand / total) * 100;
                  return (
                    <tr key={r.category} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 20px", color: "#0f172a" }}>{r.category}</td>
                      <td
                        style={{
                          padding: "10px 20px",
                          textAlign: "right",
                          color: "#64748b",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {r.count}
                      </td>
                      <td
                        style={{
                          padding: "10px 20px",
                          textAlign: "right",
                          color: "#0f172a",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {r.onHand.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "10px 20px",
                          textAlign: "right",
                          color: "#64748b",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {share.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Derived views ────────────────────────────────────────────────────────

const STATUS_DOT: Record<MaterialStatus, string> = {
  OK: "#0d9488",
  LOW_STOCK: "#f59e0b",
  OUT_OF_STOCK: "#ef4444",
};

function OverviewView({
  materials,
  stats,
  onOpenBreakdown,
}: {
  materials: RawMaterialView[] | null;
  stats: { totalSkus: number; lowCount: number; criticalCount: number; totalOnHand: number };
  onOpenBreakdown: () => void;
}) {
  const list = materials ?? [];
  const statusCounts: Record<MaterialStatus, number> = {
    OK: 0,
    LOW_STOCK: 0,
    OUT_OF_STOCK: 0,
  };
  for (const m of list) statusCounts[m.status] += 1;
  const total = Math.max(1, list.length);
  const catBars = (() => {
    const m = new Map<string, number>();
    for (const x of list) m.set(x.category, (m.get(x.category) ?? 0) + x.on_hand);
    return Array.from(m.entries())
      .map(([category, onHand]) => ({ category, onHand }))
      .sort((a, b) => b.onHand - a.onHand)
      .slice(0, 8);
  })();
  const catMax = catBars.reduce((mx, b) => Math.max(mx, b.onHand), 0) || 1;
  const criticalRows = list.filter(isCritical).slice(0, 5);

  return (
    <main style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <KpiTile label="Total SKUs" value={stats.totalSkus} />
        <KpiTile label="Low Stock" value={stats.lowCount} color="#f59e0b" />
        <KpiTile label="Critical" value={stats.criticalCount} color="#ef4444" />
        <KpiTile
          label="Total On Hand"
          value={stats.totalOnHand.toLocaleString()}
          actionLabel="View breakdown →"
          onClick={onOpenBreakdown}
        />
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <Card title="Status breakdown">
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {(Object.keys(statusCounts) as MaterialStatus[]).map((k) => {
              const pct = (statusCounts[k] / total) * 100;
              return (
                <li key={k} style={{ fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "#0f172a" }}>{STATUS_PILL[k].label}</span>
                    <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
                      {statusCounts[k]}
                    </span>
                  </div>
                  <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: STATUS_DOT[k] }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Top categories by on-hand units">
          {catBars.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 12 }}>No materials loaded.</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {catBars.map((b) => (
                <li key={b.category} style={{ fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#0f172a" }}>{b.category}</span>
                    <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
                      {b.onHand.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ height: 4, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", marginTop: 4 }}>
                    <div style={{ width: `${(b.onHand / catMax) * 100}%`, height: "100%", background: "#0d9488" }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title={`Critical items — needs immediate attention (${criticalRows.length})`}>
          {criticalRows.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 12 }}>
              No critical materials right now. ✓
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {criticalRows.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 0", color: "#0f172a", fontWeight: 500 }}>{m.name}</td>
                    <td style={{ padding: "8px 0", color: "#64748b", fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{m.sku}</td>
                    <td style={{ padding: "8px 0", color: "#475569", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {m.on_hand} / {m.reorder_threshold} {m.unit}
                    </td>
                    <td style={{ padding: "8px 0", textAlign: "right" }}>
                      <span
                        style={{
                          background: STATUS_PILL.OUT_OF_STOCK.bg,
                          color: STATUS_PILL.OUT_OF_STOCK.fg,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        Critical
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </main>
  );
}

function WorkOrdersView({
  materials,
  onAdjust,
  onReorder,
}: {
  materials: RawMaterialView[] | null;
  onAdjust: (m: RawMaterialView) => void;
  onReorder: (m: RawMaterialView) => void;
}) {
  const list = materials ?? [];
  const queue = list
    .filter((m) => isLow(m) || isCritical(m))
    .sort((a, b) => {
      const aCrit = isCritical(a) ? 1 : 0;
      const bCrit = isCritical(b) ? 1 : 0;
      if (aCrit !== bCrit) return bCrit - aCrit;
      const aDays = a.days_until_stockout ?? 9999;
      const bDays = b.days_until_stockout ?? 9999;
      return aDays - bDays;
    });

  return (
    <main style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <KpiTile label="In Queue" value={queue.length} />
        <KpiTile
          label="Critical"
          value={queue.filter(isCritical).length}
          color="#ef4444"
        />
        <KpiTile
          label="At Risk (Low)"
          value={queue.filter((m) => isLow(m) && !isCritical(m)).length}
          color="#f59e0b"
        />
      </div>

      <Card title={`Reorder queue · ${queue.length}`}>
        {queue.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 13, padding: 12 }}>
            No materials currently below their reorder threshold. Stock levels
            look healthy.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <Th>Material</Th>
                <Th>Supplier</Th>
                <Th align="right">On Hand</Th>
                <Th align="right">Minimum</Th>
                <Th align="right">Days until stockout</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {queue.map((m) => {
                const critical = isCritical(m);
                return (
                  <tr key={m.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", color: "#0f172a", fontWeight: 500 }}>
                      {m.name}
                      <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                        {m.sku}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", color: "#475569" }}>{m.supplier || "—"}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
                      {m.on_hand} {m.unit}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
                      {m.reorder_threshold}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: "#475569", fontVariantNumeric: "tabular-nums" }}>
                      {m.days_until_stockout === null ? "—" : `${m.days_until_stockout}d`}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          background: critical ? STATUS_PILL.OUT_OF_STOCK.bg : STATUS_PILL.LOW_STOCK.bg,
                          color: critical ? STATUS_PILL.OUT_OF_STOCK.fg : STATUS_PILL.LOW_STOCK.fg,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {critical ? "Critical" : "Low"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" onClick={() => onAdjust(m)} style={rowBtnStyle}>
                        Adjust
                      </button>
                      <button
                        type="button"
                        onClick={() => onReorder(m)}
                        style={{
                          ...rowBtnStyle,
                          marginLeft: 6,
                          background: "#0d9488",
                          color: "#ffffff",
                          border: "1px solid #0d9488",
                        }}
                      >
                        Reorder
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}

function VendorsView({ materials }: { materials: RawMaterialView[] | null }) {
  const [search, setSearch] = useState("");
  const list = materials ?? [];
  const groups = useMemo(() => {
    const m = new Map<
      string,
      {
        supplier: string;
        skuCount: number;
        onHand: number;
        lowCount: number;
        avgLead: number;
        categories: Set<string>;
      }
    >();
    for (const x of list) {
      const key = x.supplier || "—";
      const g =
        m.get(key) ??
        { supplier: key, skuCount: 0, onHand: 0, lowCount: 0, avgLead: 0, categories: new Set() };
      g.skuCount += 1;
      g.onHand += x.on_hand;
      if (isLow(x) || isCritical(x)) g.lowCount += 1;
      g.avgLead += x.lead_time_days;
      g.categories.add(x.category);
      m.set(key, g);
    }
    return Array.from(m.values())
      .map((g) => ({ ...g, avgLead: Math.round(g.avgLead / Math.max(1, g.skuCount)) }))
      .sort((a, b) => b.skuCount - a.skuCount);
  }, [list]);

  const q = search.trim().toLowerCase();
  const filtered = q ? groups.filter((g) => g.supplier.toLowerCase().includes(q)) : groups;

  return (
    <main style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <Card
        title={`Vendors · ${filtered.length} of ${groups.length}`}
        toolbar={
          <input
            type="search"
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: 220,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              color: "#0f172a",
              outline: "none",
            }}
          />
        }
      >
        {filtered.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 13, padding: 12 }}>
            No vendors match the search.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <Th>Supplier</Th>
                <Th align="right">SKUs supplied</Th>
                <Th align="right">Total on hand</Th>
                <Th align="right">Needing reorder</Th>
                <Th align="right">Avg lead time</Th>
                <Th>Categories</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.supplier} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", color: "#0f172a", fontWeight: 500 }}>
                    {g.supplier}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
                    {g.skuCount}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: "#475569", fontVariantNumeric: "tabular-nums" }}>
                    {g.onHand.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      textAlign: "right",
                      color: g.lowCount > 0 ? "#ef4444" : "#475569",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: g.lowCount > 0 ? 600 : 400,
                    }}
                  >
                    {g.lowCount}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: "#475569", fontVariantNumeric: "tabular-nums" }}>
                    {g.avgLead}d
                  </td>
                  <td style={{ padding: "10px 14px", color: "#64748b" }}>
                    {Array.from(g.categories).slice(0, 3).join(", ")}
                    {g.categories.size > 3 ? ` +${g.categories.size - 3}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}

function ReportsView({
  materials,
  stats,
}: {
  materials: RawMaterialView[] | null;
  stats: { totalSkus: number; lowCount: number; criticalCount: number; totalOnHand: number };
}) {
  const list = materials ?? [];
  const totalDailyBurn = list.reduce((s, m) => s + m.daily_consumption, 0);
  const totalReserved = list.reduce((s, m) => s + m.reserved, 0);
  const avgLead = list.length === 0
    ? 0
    : Math.round(list.reduce((s, m) => s + m.lead_time_days, 0) / list.length);

  // Status by category — stacked counts
  const grid = (() => {
    const m = new Map<string, { ok: number; low: number; out: number }>();
    for (const x of list) {
      const g = m.get(x.category) ?? { ok: 0, low: 0, out: 0 };
      if (x.status === "OK") g.ok += 1;
      else if (x.status === "LOW_STOCK") g.low += 1;
      else g.out += 1;
      m.set(x.category, g);
    }
    return Array.from(m.entries())
      .map(([category, v]) => ({ category, ...v, total: v.ok + v.low + v.out }))
      .sort((a, b) => b.total - a.total);
  })();

  return (
    <main style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <KpiTile label="SKUs" value={stats.totalSkus} />
        <KpiTile label="Total on hand" value={stats.totalOnHand.toLocaleString()} />
        <KpiTile label="Daily burn" value={totalDailyBurn.toLocaleString()} />
        <KpiTile label="Avg lead time" value={`${avgLead}d`} />
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Status by category">
          {grid.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>No materials loaded.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <Th>Category</Th>
                  <Th align="right">OK</Th>
                  <Th align="right">Low</Th>
                  <Th align="right">Critical</Th>
                  <Th>Distribution</Th>
                </tr>
              </thead>
              <tbody>
                {grid.map((row) => {
                  const okPct = (row.ok / row.total) * 100;
                  const lowPct = (row.low / row.total) * 100;
                  const outPct = (row.out / row.total) * 100;
                  return (
                    <tr key={row.category} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 14px", color: "#0f172a", fontWeight: 500 }}>{row.category}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "#475569", fontVariantNumeric: "tabular-nums" }}>
                        {row.ok}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: row.low > 0 ? "#f59e0b" : "#475569", fontVariantNumeric: "tabular-nums" }}>
                        {row.low}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: row.out > 0 ? "#ef4444" : "#475569", fontVariantNumeric: "tabular-nums" }}>
                        {row.out}
                      </td>
                      <td style={{ padding: "10px 14px", minWidth: 180 }}>
                        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "#f1f5f9" }}>
                          {okPct > 0 ? <div style={{ width: `${okPct}%`, background: "#0d9488" }} /> : null}
                          {lowPct > 0 ? <div style={{ width: `${lowPct}%`, background: "#f59e0b" }} /> : null}
                          {outPct > 0 ? <div style={{ width: `${outPct}%`, background: "#ef4444" }} /> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Pipeline snapshot">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            <Stat label="Total reserved" value={totalReserved.toLocaleString()} />
            <Stat label="Total available" value={(stats.totalOnHand - totalReserved).toLocaleString()} />
            <Stat label="Healthy SKUs" value={stats.totalSkus - stats.lowCount} />
          </div>
        </Card>
      </div>
    </main>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  color = "#0f172a",
  actionLabel,
  onClick,
}: {
  label: string;
  value: number | string;
  color?: string;
  actionLabel?: string;
  onClick?: () => void;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "14px 16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color,
          marginTop: 6,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {actionLabel ? (
        <button
          type="button"
          onClick={onClick}
          style={{
            background: "none",
            border: "none",
            color: "#0d9488",
            fontSize: 11,
            padding: 0,
            marginTop: 4,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function Card({
  title,
  toolbar,
  children,
}: {
  title: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{title}</h3>
        {toolbar ? <div style={{ marginLeft: "auto" }}>{toolbar}</div> : null}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right" | "left";
}) {
  return (
    <th
      style={{
        padding: "10px 14px",
        textAlign: align ?? "left",
        color: "#64748b",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        fontWeight: 600,
        borderBottom: "1px solid #e2e8f0",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}
