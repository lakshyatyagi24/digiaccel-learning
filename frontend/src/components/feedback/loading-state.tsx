import { Spinner } from "@/components/ui/spinner";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-16 text-center"
      role="status"
    >
      <Spinner className="h-8 w-8" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
