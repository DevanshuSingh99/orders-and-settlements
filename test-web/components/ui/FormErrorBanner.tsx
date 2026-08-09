import type { FormattedApiError } from "@/lib/api/errors";
import { flattenFieldErrorMessages } from "@/lib/api/errors";

export function FormErrorBanner({
  error,
  className = "",
  showFieldList = true,
}: {
  error: FormattedApiError | string | null | undefined;
  className?: string;
  showFieldList?: boolean;
}) {
  if (!error) return null;

  if (typeof error === "string") {
    return (
      <p className={`text-sm text-red-600 ${className}`} role="alert">
        {error}
      </p>
    );
  }

  const fieldLines = flattenFieldErrorMessages(error.fieldErrors, 6);
  const listVisible =
    showFieldList && fieldLines.length > 0 && error.code === "VALIDATION_ERROR";

  return (
    <div
      className={`rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`}
      role="alert"
    >
      <p className="font-medium">{error.message}</p>
      {listVisible ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-red-700/95">
          {fieldLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {error.hint ? <p className="mt-1.5 text-red-600/90">{error.hint}</p> : null}
    </div>
  );
}
