import Image from "next/image";
import type { Team } from "@/lib/types";

export function TeamLogo({ team, size = 32 }: { team: Team; size?: number }) {
  if (!team.logo) {
    return <span className="inline-block shrink-0 rounded-full bg-surface-2" style={{ width: size, height: size }} />;
  }
  // alt is empty because the team name is always written next to the logo.
  return <Image src={team.logo} alt="" width={size} height={size} className="shrink-0 object-contain" />;
}
