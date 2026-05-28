import { Badge, cn } from "@kleffio/ui";

export type GameServerRegion =
  | "us-east-1"
  | "us-west-2"
  | "eu-west-1"
  | "eu-central-1"
  | "ap-southeast-1"
  | "ap-northeast-1"
  | "ca-central-1"
  | "sa-east-1";

export const REGION_LABELS: Record<GameServerRegion, string> = {
  "us-east-1":      "US East (N. Virginia)",
  "us-west-2":      "US West (Oregon)",
  "eu-west-1":      "Europe (Ireland)",
  "eu-central-1":   "Europe (Frankfurt)",
  "ap-southeast-1": "Asia Pacific (Singapore)",
  "ap-northeast-1": "Asia Pacific (Tokyo)",
  "ca-central-1":   "Canada (Central)",
  "sa-east-1":      "South America (São Paulo)",
};

interface RegionBadgeProps {
  region: GameServerRegion;
  short?: boolean;
  className?: string;
}

const REGION_FLAGS: Record<GameServerRegion, string> = {
  "us-east-1":      "🇺🇸",
  "us-west-2":      "🇺🇸",
  "eu-west-1":      "🇮🇪",
  "eu-central-1":   "🇩🇪",
  "ap-southeast-1": "🇸🇬",
  "ap-northeast-1": "🇯🇵",
  "ca-central-1":   "🇨🇦",
  "sa-east-1":      "🇧🇷",
};

const REGION_SHORT: Record<GameServerRegion, string> = {
  "us-east-1":      "US East",
  "us-west-2":      "US West",
  "eu-west-1":      "EU West",
  "eu-central-1":   "EU Central",
  "ap-southeast-1": "Singapore",
  "ap-northeast-1": "Tokyo",
  "ca-central-1":   "Canada",
  "sa-east-1":      "São Paulo",
};

export function RegionBadge({ region, short = false, className }: RegionBadgeProps) {
  const label = short ? REGION_SHORT[region] : REGION_LABELS[region];

  return (
    <Badge
      className={cn(
        "h-auto gap-1.5 border-0 ring-1 ring-inset ring-zinc-700/50 bg-zinc-800 text-zinc-300",
        className
      )}
    >
      {REGION_FLAGS[region]}
      {label ?? region}
    </Badge>
  );
}
