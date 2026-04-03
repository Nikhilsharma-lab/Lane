interface Props {
  name: string;
  color: string;
  className?: string;
}

export function ProjectBadge({ name, color, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs text-zinc-400">{name}</span>
    </span>
  );
}
