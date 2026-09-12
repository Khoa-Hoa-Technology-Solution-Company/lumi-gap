interface LoadingSpinnerProps {
  fullPage?: boolean;
  label?: string;
}

export function LoadingSpinner({ fullPage = false, label = 'Loading...' }: LoadingSpinnerProps) {
  const spinnerContent = (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-[#e2d6c7]" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-r-[#b88944] border-t-[#b88944]" />
      </div>
      {label && <p className="text-sm font-medium text-[#7d6d60]">{label}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6efe7]">
        {spinnerContent}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      {spinnerContent}
    </div>
  );
}

interface LoadingSkeletonProps {
  rows?: number;
  variant?: 'card' | 'table' | 'profile' | 'stats';
}

export function LoadingSkeleton({ rows = 3, variant = 'card' }: LoadingSkeletonProps) {
  if (variant === 'profile') {
    return (
      <div className="space-y-6">
        <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
          <div className="h-28 animate-pulse bg-gray-200" />
          <div className="px-8 pb-8">
            <div className="-mt-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="h-28 w-28 animate-pulse rounded-lg border-4 border-white bg-gray-300" />
                <div className="space-y-3 pb-2">
                  <div className="h-5 w-36 animate-pulse rounded bg-gray-200" />
                  <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 w-80 max-w-full animate-pulse rounded bg-gray-200" />
                </div>
              </div>
              <div className="h-12 w-32 animate-pulse rounded-lg bg-gray-200" />
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border p-4">
                  <div className="mb-3 h-4 w-20 animate-pulse rounded bg-gray-200" />
                  <div className="h-8 w-12 animate-pulse rounded bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <div className="mb-6 flex gap-4 border-b border-border pb-4">
            <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
            <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
            <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <div className="mb-3 h-4 w-32 animate-pulse rounded bg-gray-200" />
                <div className="h-5 w-full animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'stats') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg border border-border bg-white p-5 shadow-sm">
            <div className="mb-4 h-4 w-20 rounded bg-gray-200" />
            <div className="mb-2 h-8 w-24 rounded bg-gray-200" />
            <div className="h-3 w-32 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded bg-gray-200" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border bg-white p-5 shadow-sm">
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}
