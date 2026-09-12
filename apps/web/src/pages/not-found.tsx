import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * 404 page. Mounted as catch-all under MainLayout in app-routes.tsx.
 *
 * Owner: Dev 3 (UI foundation)
 *
 * Note: kept intentionally simple — same chrome as the app, with a clear
 * recovery CTA. Avoid decorative illustrations.
 */
export function NotFoundPage() {
  return (
    <main className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Button asChild className="mt-8">
        <Link to="/">Back home</Link>
      </Button>
    </main>
  );
}
