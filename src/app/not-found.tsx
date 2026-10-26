import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 rounded-xl border border-edge bg-surface p-6">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-ink-2">The only leagues here are the NFL and NBA.</p>
      <Link href="/" className="self-start text-sm font-medium underline">
        Back to the home page
      </Link>
    </main>
  );
}
