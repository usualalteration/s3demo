import { NavLink } from "react-router-dom";
import { BarChart3, Clock, HardDrive } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getStats } from "@/lib/api";
import { formatBytes } from "@/lib/format";

/** Geometric red storage mark for the S3 Object Studio logo. */
export function StudioLogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="3" y="3" width="26" height="26" rx="7" fill="#C62828" />
      <g stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M9.5 12h13" />
        <path d="M9.5 16.5h13" opacity="0.85" />
        <path d="M9.5 21h8" opacity="0.7" />
      </g>
      <circle cx="22.5" cy="21" r="1.6" fill="#fff" opacity="0.7" />
    </svg>
  );
}

const NAV_ITEMS = [
  { to: "/storage", label: "My Storage", icon: HardDrive },
  { to: "/recent", label: "Recent Files", icon: Clock },
  { to: "/overview", label: "Storage Overview", icon: BarChart3 },
];

export function Sidebar() {
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats, staleTime: 10_000 });

  const stats = statsQuery.data?.stats;

  return (
    <div className="flex h-full flex-col bg-studio-charcoal text-white/90">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <StudioLogoMark className="h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight tracking-tight text-white">
            S3 Object Studio
          </p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Object Storage</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/30",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/55 hover:bg-white/5 hover:text-white/90",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-studio-crimson-accent transition-all duration-200",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                />
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4">
        <div className="rounded-xl border border-white/10 bg-studio-graphite p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">
              Storage used
            </p>
          </div>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-white">
            {stats ? formatBytes(stats.size) : "…"}
          </p>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-studio-crimson-accent transition-all duration-300"
              style={{ width: "100%" }}
            />
          </div>
          <p className="mt-2.5 text-[11px] text-white/45">
            {stats
              ? `${stats.files} file${stats.files === 1 ? "" : "s"} · ${stats.folders} folder${stats.folders === 1 ? "" : "s"}`
              : "Loading…"}
          </p>
        </div>
        <p className="mt-3 truncate px-1 font-mono-tech text-[10px] text-white/30" title="s3-studio/">
          s3-studio/
        </p>
      </div>
    </div>
  );
}