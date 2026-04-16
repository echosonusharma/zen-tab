import { h } from "preact";

interface IconProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

export function WindowIcon({ className, width = 12, height = 12 }: IconProps) {
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
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );
}
