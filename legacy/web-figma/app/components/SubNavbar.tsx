interface SubNavbarItem {
  label: string;
  value: string;
}

interface SubNavbarProps {
  items: SubNavbarItem[];
  activeValue: string;
  onSelect: (value: string) => void;
  title?: string;
}

export function SubNavbar({ items, activeValue, onSelect, title }: SubNavbarProps) {
  return (
    <div className="mb-4 rounded-2xl border border-[#dfd4c7] bg-[#fffaf4] p-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {title && <span className="px-3 text-sm font-medium text-[#7d6d60]">{title}</span>}
        {items.map((item) => {
          const isActive = activeValue === item.value;

          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onSelect(item.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#2f251f] text-[#fffaf4] shadow-sm'
                  : 'bg-[#f4ebe1] text-[#7b5b3a] hover:bg-[#ead9c7] hover:text-[#5e4630]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
