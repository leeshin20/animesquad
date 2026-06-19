"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet, type Me } from "@/app/lib/api";

const baseLinks = [
  { href: "/anime/search", label: "탐색" },
  { href: "/my/list", label: "내 목록" },
  { href: "/squads", label: "스쿼드" },
  { href: "/me", label: "내 정보" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    apiGet<Me>("/api/me").then((me) => setIsAdmin(!!me.isAdmin)).catch(() => {});
  }, []);

  const links = isAdmin
    ? [...baseLinks, { href: "/admin/anime", label: "관리자" }]
    : baseLinks;

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-base font-semibold tracking-tight">
          AnimeSquad
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  "rounded-md px-3 py-1.5 text-sm transition " +
                  (active
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900")
                }
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
