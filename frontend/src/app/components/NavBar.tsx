"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet, type Me } from "@/app/lib/api";

const baseLinks = [
  { href: "/search", label: "탐색" },
  { href: "/watchlist", label: "내 목록" },
  { href: "/squads", label: "스쿼드" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    apiGet<Me>("/api/me").then(setMe).catch(() => {});
  }, []);

  const links = me?.isAdmin
    ? [...baseLinks, { href: "/admin/anime", label: "관리자" }]
    : baseLinks;

  const profileActive =
    pathname === "/profile" || pathname.startsWith("/profile/");

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
          {me && (
            <Link
              href="/profile"
              className={
                "ml-2 flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm transition " +
                (profileActive
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-700 hover:bg-neutral-100")
              }
            >
              <Avatar name={me.displayName} url={me.avatarUrl} />
              <span className="max-w-[8rem] truncate">{me.displayName}</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-7 w-7 flex-none rounded-full object-cover" />;
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-600">
      {initial}
    </div>
  );
}
