"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, type AnimeView, type Me } from "@/app/lib/api";
import { displayTitle } from "@/app/lib/anilist-labels";

const baseLinks = [
  { href: "/browse", label: "탐색" },
  { href: "/watchlist", label: "내 목록" },
  { href: "/squads", label: "스쿼드" },
];

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6.5" cy="6.5" r="4" />
    <line x1="10" y1="10" x2="14" y2="14" />
  </svg>
);

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AnimeView[]>([]);
  const desktopSearchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  const closeSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  useEffect(() => {
    apiGet<Me>("/api/me").then((m) => {
      setMe(m);
      if (!m.onboardingComplete && pathname !== "/onboarding") {
        router.push("/onboarding");
      }
    }).catch(() => {});
  }, []);

  // 라우트 변경 시 드로어 + 검색 닫기
  useEffect(() => {
    setDrawerOpen(false);
    closeSearch();
  }, [pathname, closeSearch]);

  // 드로어 열릴 때 바디 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // 검색 debounce
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await apiGet<AnimeView[]>(
          `/api/anime/search?q=${encodeURIComponent(searchQuery)}`
        );
        setSearchResults(res.slice(0, 5));
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // 드로어 열릴 때 Escape 닫기
  useEffect(() => {
    if (!drawerOpen) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [drawerOpen]);

  // 검색 결과 바깥 클릭 시 닫기
  useEffect(() => {
    if (searchResults.length === 0) return;
    function handle(e: MouseEvent) {
      const inDesktop = desktopSearchRef.current?.contains(e.target as Node);
      const inMobile = mobileSearchRef.current?.contains(e.target as Node);
      if (!inDesktop && !inMobile) closeSearch();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [searchResults.length, closeSearch]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      closeSearch();
    }
    if (e.key === "Escape") closeSearch();
  }

  const links = me?.isAdmin
    ? [...baseLinks, { href: "/admin/anime", label: "관리자" }]
    : baseLinks;

  const profileActive =
    pathname === "/profile" || pathname.startsWith("/profile/");

  const searchInput = (ref: React.RefObject<HTMLDivElement>, inputClass: string, dropdownClass: string) => (
    <div ref={ref} className="relative">
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-2.5 text-neutral-400">
          <SearchIcon />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="제목 검색…"
          className={inputClass}
        />
      </div>
      {searchResults.length > 0 && (
        <ul className={dropdownClass}>
          {searchResults.map((a) => (
            <li key={a.id}>
              <Link
                href={`/anime/${a.id}`}
                className="flex items-center gap-3 px-3 py-2 hover:bg-neutral-50"
                onClick={closeSearch}
              >
                {a.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.coverImageUrl} alt="" className="h-10 w-7 flex-none rounded object-cover" />
                ) : (
                  <div className="h-10 w-7 flex-none rounded bg-neutral-100" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{displayTitle(a)}</p>
                  <p className="text-xs text-neutral-500">{a.seasonYear ?? "-"}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 md:px-6">
          <Link href="/" className="shrink-0 text-base font-semibold tracking-tight">
            AnimeSquad
          </Link>

          {/* 모바일 검색창 — 햄버거 바로 왼쪽 */}
          <div className="ml-auto md:hidden w-36">
            {searchInput(
              mobileSearchRef as React.RefObject<HTMLDivElement>,
              "w-full rounded-md border border-neutral-300 py-1.5 pl-8 pr-3 text-sm focus:border-neutral-900 focus:outline-none",
              "absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
            )}
          </div>

          {/* 데스크탑 nav */}
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {searchInput(
              desktopSearchRef as React.RefObject<HTMLDivElement>,
              "w-44 rounded-md border border-neutral-300 py-1.5 pl-8 pr-3 text-sm focus:border-neutral-900 focus:outline-none",
              "absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
            )}

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
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className="shrink-0 flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="5" x2="17" y2="5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="15" x2="17" y2="15" />
            </svg>
          </button>
        </div>
      </header>

      {/* 모바일 드로어 — 항상 마운트, CSS로 show/hide */}
      {/* @ts-expect-error inert is a valid HTML attribute not yet in React types */}
      <div inert={!drawerOpen ? "" : undefined} aria-hidden={!drawerOpen} className={`fixed inset-0 z-50 md:hidden ${drawerOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
        {/* 딤 배경 */}
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${drawerOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setDrawerOpen(false)}
        />
        {/* 드로어 패널 */}
        <div className={`absolute right-0 top-0 flex h-full w-64 flex-col bg-white shadow-xl transition-transform duration-200 ease-out ${drawerOpen ? "translate-x-0" : "translate-x-full"}`}>
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
    </>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url ?? "/default-avatar.png"} alt={name} className="h-7 w-7 flex-none rounded-full object-cover" />;
}
