"use client";

interface TopNavProps {
  instanceName: string;
}

const NAV_ITEMS: { label: string; active?: boolean }[] = [
  { label: "Dashboard" },
  { label: "Work Orders" },
  { label: "Schedules" },
  { label: "Raw Materials", active: true },
  { label: "Vendors" },
  { label: "Reports" },
];

export function TopNav({ instanceName }: TopNavProps) {
  return (
    <header
      style={{ height: 48, background: "#0f1e2e" }}
      className="sticky top-0 z-30 flex w-full items-center px-4"
    >
      <div className="flex items-center gap-2 border-r border-white/10 pr-4">
        <div
          className="flex items-center justify-center rounded-sm font-bold"
          style={{
            height: 22,
            width: 22,
            background: "#4dd9ac",
            color: "#0f1e2e",
            fontSize: 12,
          }}
          aria-hidden
        >
          O
        </div>
        <span className="font-bold text-white" style={{ fontSize: 13, letterSpacing: 0.2 }}>
          OpenPrem
        </span>
      </div>

      <nav className="flex h-full items-stretch pl-6">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.label}
            type="button"
            className="relative flex items-center px-4 transition-colors"
            style={{
              fontSize: 12,
              color: item.active ? "#4dd9ac" : "rgba(255,255,255,0.5)",
              fontWeight: item.active ? 600 : 500,
              cursor: item.active ? "default" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!item.active) e.currentTarget.style.color = "rgba(255,255,255,0.85)";
            }}
            onMouseLeave={(e) => {
              if (!item.active) e.currentTarget.style.color = "rgba(255,255,255,0.5)";
            }}
          >
            {item.label}
            {item.active ? (
              <span
                className="absolute inset-x-3"
                style={{ bottom: 0, height: 2, background: "#4dd9ac" }}
              />
            ) : null}
          </button>
        ))}
      </nav>

      <div className="ml-auto">
        <span
          style={{
            background: "rgba(77,217,172,0.15)",
            color: "#4dd9ac",
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 20,
            letterSpacing: 0.3,
          }}
        >
          {instanceName}
        </span>
      </div>
    </header>
  );
}
