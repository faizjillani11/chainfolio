import { Badge } from "@/components/ui/Badge";

interface DataSourceBadgeProps {
  source: "indexed" | "live" | "mock";
}

export function DataSourceBadge({ source }: DataSourceBadgeProps) {
  if (source === "indexed") {
    return <Badge label="Indexed cache" variant="green" dot />;
  }

  if (source === "mock") {
    return <Badge label="Demo data" variant="indigo" dot />;
  }

  return <Badge label="Live fetch" variant="yellow" dot />;
}
