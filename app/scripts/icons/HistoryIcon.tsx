import { h } from "preact";

interface IconProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

export function HistoryIcon({ className, width = 12, height = 12 }: IconProps) {
  return (
    <svg 
      className={className}
      width={width} 
      height={height} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
