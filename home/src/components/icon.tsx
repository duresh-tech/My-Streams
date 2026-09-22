import {
  Activity,
  BarChart3,
  Gauge,
  Headphones,
  MonitorPlay,
  Radio,
  RotateCw,
  Server,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The JSON store names icons as strings, so this maps those names onto the
 * actual components. Unknown names fall back rather than crashing a page.
 */
const ICONS: Record<string, LucideIcon> = {
  Activity,
  BarChart3,
  Gauge,
  Headphones,
  MonitorPlay,
  Radio,
  RotateCw,
  Server,
  Share2,
  ShieldCheck,
  Smartphone,
  Users,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const Component = ICONS[name] ?? Sparkles;
  return <Component className={className} aria-hidden />;
}
