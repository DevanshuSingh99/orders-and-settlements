import { Spinner } from "@heroui/react";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-zinc-500">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  hint,
  onRetry,
}: {
  message: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-12 text-center">
      <p className="max-w-md text-sm font-medium text-red-700">{message}</p>
      {hint ? <p className="max-w-md text-sm text-red-600/90">{hint}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-red-700 underline underline-offset-2 hover:text-red-800"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 py-16 text-center">
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {description ? <p className="text-sm text-zinc-500">{description}</p> : null}
    </div>
  );
}
