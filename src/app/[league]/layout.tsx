import { Suspense } from "react";
import { LeagueTabs } from "@/components/SiteNav";
import { LEAGUE_IDS } from "@/lib/leagues";

// Tells Next.js the only leagues are /nfl and /nba.
export function generateStaticParams() {
  return LEAGUE_IDS.map((league) => ({ league }));
}

export default function LeagueLayout({ children, params }: LayoutProps<"/[league]">) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="h-[33px] border-b border-line" />}>
        <LeagueTabsFromParams params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function LeagueTabsFromParams({ params }: Pick<LayoutProps<"/[league]">, "params">) {
  const { league } = await params;
  return <LeagueTabs league={league} />;
}
