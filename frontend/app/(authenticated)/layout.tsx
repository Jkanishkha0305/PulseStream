"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
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
  const supabase = createClientComponentClient();
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
      <aside className="w-64 bg-slate-900 h-screen fixed flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
            <span className="font-semibold text-white tracking-tight">PulseStream</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start",
                  pathname === link.href || pathname.startsWith(link.href + "/")
                    ? "bg-slate-800 text-white"
                    : "text-slate-400"
                )}
              >
                {link.label}
              </Button>
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-800 space-y-3">
          <div className="px-2 text-xs text-slate-500 truncate">{email ?? "..."}</div>
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="w-full justify-start text-slate-400 hover:text-red-400"
          >
            Sign Out
          </Button>
        </div>
      </aside>

      <main className="ml-64 flex-1 min-h-screen bg-slate-950">
        {children}
      </main>
    </div>
  );
}
