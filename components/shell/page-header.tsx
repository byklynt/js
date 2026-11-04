import { HeaderZone } from "./header-zone";
import { PageHeading } from "./page-heading";

/** Pattern zone + heading + subtext, used at the top of every dashboard/admin page. */
export function PageHeader({
  title,
  subtitle,
  align = "left",
  subtitleClassName,
}: {
  title: string;
  subtitle: string;
  align?: "left" | "center";
  subtitleClassName?: string;
}) {
  return (
    <>
      <HeaderZone />
      <PageHeading title={title} subtitle={subtitle} align={align} subtitleClassName={subtitleClassName} />
    </>
  );
}
