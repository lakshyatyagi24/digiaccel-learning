import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";

interface ErrorStateProps {
  error?: unknown;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const message =
    error instanceof ApiError
      ? error.message
      : "Something went wrong while loading this.";

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-red-500" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-red-900">
          Unable to load this content
        </p>
        <p className="mt-1 text-sm text-red-700">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="mt-2">
          Retry
        </Button>
      )}
    </div>
  );
}
