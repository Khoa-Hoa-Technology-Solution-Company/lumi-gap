import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
}

export function StatsCard({ title, value, icon: Icon, color = 'bg-blue-500' }: StatsCardProps) {
  return (
    <div className="bg-white rounded-lg p-4 border border-border shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground mb-1">{title}</p>
          <h3 className="text-foreground">{value}</h3>
        </div>
        <div className={`${color} p-3 rounded-lg text-white`}>
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
}
