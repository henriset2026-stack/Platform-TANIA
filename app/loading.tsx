import { Skeleton } from "@/components/ui/skeleton";

export default function RootLoading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-10 w-48" />
      <Skeleton className="mt-8 h-64 w-full" />
    </main>
  );
}
