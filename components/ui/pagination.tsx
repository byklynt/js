import { ShowMoreButton } from "./list-states";

/** "Tampilkan lebih banyak" pagination: renders nothing when everything is visible. */
export function Pagination({
  total,
  visible,
  onMore,
}: {
  total: number;
  visible: number;
  onMore: () => void;
}) {
  if (total <= visible) return null;
  return <ShowMoreButton onClick={onMore} />;
}
