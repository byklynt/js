import { reviewText, type ReviewReason } from "@/lib/service-review";

/** "Perlu dicek": the service looks wrong (price far too high, name or category under 3 characters). Same chip look as "Margin tipis". */
export function ReviewBadge({ reasons, threshold }: { reasons: ReviewReason[]; threshold?: number }) {
  return (
    <span
      title={reviewText(reasons, threshold)}
      data-testid="review-badge"
      className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-300"
    >
      Perlu dicek
    </span>
  );
}
