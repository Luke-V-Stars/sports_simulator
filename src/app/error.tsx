"use client";

// Shown instead of a page when something goes wrong (usually ESPN being
// unreachable or changing its data format).

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 rounded-xl border border-edge bg-surface p-6">
      <h1 className="text-xl font-semibold">Something went wrong loading this page</h1>
      <p className="text-ink-2">
        This usually means ESPN&apos;s data service didn&apos;t respond. Check your internet connection and try again.
      </p>
      <p className="rounded bg-surface-2 p-2 font-mono text-xs text-ink-2">{error.message}</p>
      <button
        type="button"
        onClick={() => retry()}
        className="self-start rounded-md bg-ink px-4 py-1.5 text-sm font-semibold text-page hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
