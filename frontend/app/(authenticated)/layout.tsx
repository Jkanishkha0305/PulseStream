"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/alerts", label: "Alerts" },
];

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 bg-slate-900 h-screen fixed flex flex-col border-r border-slate-800">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
            <span className="font-semibold text-white tracking-tight text-sm">
              PulseStream
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link key={link.href} href={link.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                    isActive
                      ? "bg-slate-800 text-white border-l-2 border-violet-500 pl-[10px]"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                  )}
                >
                  {link.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-800 space-y-3">
          <div className="px-2 text-xs text-slate-500 truncate">{email ?? "..."}</div>
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="w-full justify-start text-slate-500 hover:text-red-400 text-xs"
          >
            Sign Out
          </Button>
        </div>
      </aside>

      <main className="ml-56 flex-1 min-h-screen bg-slate-950">
        {children}
      </main>
    </div>
  );
}
