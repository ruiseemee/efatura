export function Logo({ className = "h-7" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="h-full w-auto" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.15" />
        <path d="M9 11h14M9 16h14M9 21h9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="23" cy="21" r="2" fill="#34d399" />
      </svg>
      <span className="text-[1.05em]">e-Fatura<span className="font-normal opacity-70"> AT</span></span>
    </span>
  );
}
