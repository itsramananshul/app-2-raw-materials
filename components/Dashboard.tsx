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

      {activeNav !== "raw-materials" ? (
        <ComingSoonPanel
          label={activeNav}
          onBack={() => setActiveNav("raw-materials")}
        />
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

function ComingSoonPanel({
  label,
  onBack,
}: {
  label: string;
  onBack: () => void;
}) {
  const title = label
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return (
    <main style={{ padding: 40, maxWidth: 800, margin: "0 auto" }}>
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: 32,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
          {title}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#0f172a", marginTop: 8 }}>
          {title} — coming soon
        </h2>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>
          This view isn&apos;t built yet for this instance. Switch back to Raw
          Materials to manage inventory.
        </p>
        <button
          type="button"
          onClick={onBack}
          style={{
            marginTop: 16,
            background: "#0d9488",
            color: "#ffffff",
            border: "none",
            padding: "8px 16px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← Back to Raw Materials
        </button>
      </div>
    </main>
  );
}
