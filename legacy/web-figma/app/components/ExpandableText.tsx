import { useState } from 'react';

type ExpandableTextProps = {
  text: string;
  lines?: number; // number of lines to show when collapsed
  expandable?: boolean;
};

export default function ExpandableText({ text, lines = 4, expandable = true }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);

  const clampClass =
    lines === 2 ? 'line-clamp-2' : lines === 3 ? 'line-clamp-3' : lines === 5 ? 'line-clamp-5' : 'line-clamp-4';

  return (
    <div>
      <p className={`${expanded ? '' : clampClass} mb-2 text-muted-foreground`}>{text}</p>
      {expandable && text.split('\n').join(' ').trim().length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="text-sm text-primary hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
