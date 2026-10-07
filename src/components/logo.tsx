export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" stroke="#d1fe17" strokeWidth="3" />
      <path
        d="M9 22V10l7 8 7-8v12"
        stroke="#d1fe17"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
