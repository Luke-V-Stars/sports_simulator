"use client";

// The menus at the top of the page. They're "client components" (they run in
// the browser) because they need to know which page you're on to highlight it.
// The page address isn't known ahead of time on game pages, so each menu first
// shows without a highlight (the <Suspense> fallback), then highlights.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/nfl", label: "NFL" },
  { href: "/nba", label: "NBA" },
  { href: "/how-it-works", label: "How it works" },
];

export function SiteNav() {
  return (
    <Suspense fallback={<SiteLinks pathname="" />}>
      <SiteNavWithPath />
    </Suspense>
  );
}

function SiteNavWithPath() {
  return <SiteLinks pathname={usePathname()} />;
}

function SiteLinks({ pathname }: { pathname: string }) {
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav className="flex items-center gap-1 overflow-x-auto text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-md px-3 py-1.5 whitespace-nowrap ${
            isActive(link.href) ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function LeagueTabs({ league }: { league: string }) {
  return (
    <Suspense fallback={<Tabs league={league} pathname="" />}>
      <LeagueTabsWithPath league={league} />
    </Suspense>
  );
}

function LeagueTabsWithPath({ league }: { league: string }) {
  return <Tabs league={league} pathname={usePathname()} />;
}

function Tabs({ league, pathname }: { league: string; pathname: string }) {
  const onRankings = pathname.includes("/rankings");
  const tabs = [
    { href: `/${league}`, label: "Games", active: pathname !== "" && !onRankings },
    { href: `/${league}/rankings`, label: "Power rankings", active: onRankings },
  ];
  return (
    <div className="flex gap-4 border-b border-line text-sm">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`-mb-px border-b-2 px-1 pb-2 ${
            tab.active ? "border-ink font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
