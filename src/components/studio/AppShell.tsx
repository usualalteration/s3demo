import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sidebar, StudioLogoMark } from "./Sidebar";

const MOBILE_NAV = [
  { to: "/storage", label: "Storage" },
  { to: "/recent", label: "Recent" },
  { to: "/overview", label: "Overview" },
];

/** App shell: charcoal sidebar on desktop, compact top bar on mobile. */
export function AppShell() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-60 shrink-0 md:block" aria-label="Sidebar">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-studio-sand bg-white px-4 py-3 md:hidden">
          <StudioLogoMark className="h-6 w-6 shrink-0" />
          <span className="text-sm font-semibold">S3 Object Studio</span>
          <nav className="ml-auto flex gap-1" aria-label="Main navigation">
            {MOBILE_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isActive ? "bg-studio-crimson/10 text-studio-crimson" : "text-muted-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}