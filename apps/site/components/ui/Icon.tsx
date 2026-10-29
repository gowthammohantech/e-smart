import {
  Bell,
  Boxes,
  Building,
  ChartColumn,
  ClockFading,
  Database,
  Download,
  FileText,
  GitBranch,
  Languages,
  Mail,
  MapPin,
  MonitorSmartphone,
  Phone,
  Receipt,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  Star,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** The icon names content/site.ts may use. */
const ICONS = {
  bell: Bell,
  boxes: Boxes,
  building: Building,
  chart: ChartColumn,
  history: ClockFading,
  database: Database,
  download: Download,
  file: FileText,
  git: GitBranch,
  languages: Languages,
  mail: Mail,
  pin: MapPin,
  devices: MonitorSmartphone,
  phone: Phone,
  receipt: Receipt,
  scan: ScanLine,
  search: Search,
  send: Send,
  shield: ShieldCheck,
  star: Star,
  users: Users,
  wallet: Wallet,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph className={className} strokeWidth={1.75} aria-hidden />;
}
