export default function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div
        className="font-mono text-[10px] uppercase tracking-widest text-ink/40 animate-wink"
        aria-live="polite"
      >
        Loading…
      </div>
    </div>
  );
}
