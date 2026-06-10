import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="border-[1.5px] border-ink bg-paper shadow-brutal max-w-md w-full">
        <div className="h-9 border-b-[1.5px] border-ink px-3 flex items-center font-mono text-[11px] uppercase tracking-widest font-bold">
          404 · Not Found
        </div>
        <div className="p-6 space-y-4">
          <div className="font-mono text-6xl font-bold leading-none">404</div>
          <p className="text-sm text-ink/70">
            The resource you&apos;re looking for doesn&apos;t exist, or was
            removed from the workspace.
          </p>
          <div className="flex items-center gap-2 pt-2 border-t-[1.5px] border-ink/10">
            <Link
              href="/"
              className="inline-flex items-center h-9 px-3 border-[1.5px] border-ink bg-accent font-mono text-[11px] uppercase tracking-wider hover:-translate-y-[1px] hover:shadow-brutal-sm transition-all"
            >
              Go Home
            </Link>
            <Link
              href="/projects"
              className="inline-flex items-center h-9 px-3 border-[1.5px] border-ink bg-paper font-mono text-[11px] uppercase tracking-wider hover:-translate-y-[1px] hover:shadow-brutal-sm transition-all"
            >
              All Projects
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
