import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-6 text-center">
      <h2 className="text-xl font-bold">Item not found</h2>
      <p className="mt-2 text-muted-foreground">The requested item could not be loaded from the API.</p>
      <Link href="/" className="mt-4 inline-block text-primary hover:underline">
        Return to dashboard
      </Link>
    </div>
  );
}
