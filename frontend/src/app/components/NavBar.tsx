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
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    apiGet<Me>("/api/me").then(setMe).catch(() => {});
  }, []);

  // 라우트 변경 시 드로어 닫기
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const links = me?.isAdmin
    ? [...baseLinks, { href: "/admin/anime", label: "관리자" }]
    : baseLinks;

  const profileActive =
    pathname === "/profile" || pathname.startsWith("/profile/");

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="text-base font-semibold tracking-tight">
            AnimeSquad
          </Link>

          {/* 데스크탑 nav */}
          <nav className="hidden items-center gap-1 md:flex">
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

          {/* 모바일 햄버거 버튼 */}
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setDrawerOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="5" x2="17" y2="5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="15" x2="17" y2="15" />
            </svg>
          </button>
        </div>
      </header>

      {/* 모바일 드로어 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* 딤 배경 */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          {/* 드로어 패널 */}
          <div className="absolute right-0 top-0 flex h-full w-64 flex-col bg-white shadow-xl">
            {/* 헤더 */}
            <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-4">
              <span className="text-base font-semibold tracking-tight">AnimeSquad</span>
              <button
                type="button"
                aria-label="메뉴 닫기"
                onClick={() => setDrawerOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="3" y1="3" x2="15" y2="15" />
                  <line x1="15" y1="3" x2="3" y2="15" />
                </svg>
              </button>
            </div>

            {/* 링크 목록 */}
            <nav className="flex-1 overflow-y-auto py-3">
              {links.map((l) => {
                const active = pathname === l.href || pathname.startsWith(l.href + "/");
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={
                      "block px-4 py-3 text-sm font-medium transition " +
                      (active
                        ? "bg-neutral-100 text-neutral-900"
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900")
                    }
                  >
                    {l.label}
                  </Link>
                );
              })}
            </nav>

            {/* 하단 프로필 */}
            {me && (
              <div className="border-t border-neutral-200 p-4">
                <Link
                  href="/profile"
                  className={
                    "flex items-center gap-3 rounded-lg px-2 py-2 transition " +
                    (profileActive ? "bg-neutral-100" : "hover:bg-neutral-50")
                  }
                >
                  <Avatar name={me.displayName} url={me.avatarUrl} />
                  <span className="truncate text-sm font-medium text-neutral-800">
                    {me.displayName}
                  </span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
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
