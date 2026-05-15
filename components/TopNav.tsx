"use client";

export type NavKey =
  | "dashboard"
  | "work-orders"
  | "raw-materials"
  | "vendors"
  | "reports";

interface TopNavProps {
  instanceName: string;
  activeNav: NavKey;
  onChangeNav: (key: NavKey) => void;
  onOpenApiKeys: () => void;
}

const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "work-orders", label: "Work Orders" },
  { key: "raw-materials", label: "Raw Materials" },
  { key: "vendors", label: "Vendors" },
  { key: "reports", label: "Reports" },
];

export function TopNav({
  instanceName,
  activeNav,
  onChangeNav,
  onOpenApiKeys,
}: TopNavProps) {
  return (
    <header
      style={{
        height: 52,
        background: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        padding: "0 20px",
      }}
      className="sticky top-0 z-30 flex w-full items-center gap-6"
    >
      <div className="flex items-center gap-2.5">
        <div
          style={{
            width: 26,
            height: 26,
            background: "#0d9488",
            borderRadius: 7,
            color: "#ffffff",
            fontWeight: 700,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-hidden
        >
          O
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
          OpenPrem
        </span>
      </div>

      <nav className="flex h-full items-stretch">
        {NAV_ITEMS.map((item) => {
          const active = activeNav === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChangeNav(item.key)}
              style={{
                position: "relative",
                padding: "0 16px",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? "#0d9488" : "#64748b",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "color 120ms ease",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = "#1e293b";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.color = "#64748b";
              }}
            >
              {item.label}
              {active ? (
                <span
                  style={{
                    position: "absolute",
                    left: 12,
                    right: 12,
                    bottom: 0,
                    height: 2,
                    background: "#0d9488",
                    borderRadius: 2,
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <span
          style={{
            background: "rgba(13,148,136,0.1)",
            color: "#0d9488",
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: 20,
            letterSpacing: 0.3,
          }}
          title="Active instance"
        >
          {instanceName}
        </span>
        <button
          type="button"
          onClick={onOpenApiKeys}
          title="Manage API keys"
          style={{
            background: "#f1f5f9",
            border: "1px solid #e2e8f0",
            color: "#475569",
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            transition: "background 120ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#e2e8f0")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#f1f5f9")}
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
      </div>
    </header>
  );
}
