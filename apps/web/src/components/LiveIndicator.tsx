export function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
      <span
        className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-sage-500' : 'bg-amber-400'}`}
        aria-hidden="true"
      />
      {connected ? 'Live' : 'Connecting…'}
    </span>
  );
}
