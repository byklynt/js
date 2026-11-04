"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  statCards,
  categories,
  services,
  platforms,
  allPlatformsId,
  getCategoriesByPlatform,
  getServicesByCategory,
  type Platform,
  type Service,
} from "@/lib/dashboard-data";
import type { PublicAnnouncement } from "@/lib/announcements-data";
import { AnnouncementBanners } from "@/components/announcements/announcement-banner";
import { WelcomeHeader } from "./welcome-header";
import { HeaderZone, HeaderLine } from "@/components/shell/header-zone";
import { StatCard } from "@/components/ui/stat-card";
import { PlatformFilter } from "./platform-filter";
import { OrderForm } from "./order-form";
import { ServiceDetail } from "./service-detail";

export function DashboardHome({
  username,
  preselectServiceId,
  announcements = [],
}: {
  username: string;
  preselectServiceId?: string;
  announcements?: PublicAnnouncement[];
}) {
  const preselected = useMemo(() => {
    if (!preselectServiceId) return null;
    const service = services.find((s) => s.id === preselectServiceId) ?? null;
    if (!service) return null;
    const category = categories.find((c) => c.id === service.categoryId) ?? null;
    const platform = category ? platforms.find((p) => p.id === category.platformId) : undefined;
    return { service, platform };
  }, [preselectServiceId]);

  const initialFilter = preselected?.platform?.id ?? allPlatformsId;
  const [platformFilter, setPlatformFilter] = useState(initialFilter);
  // Default to the first service of the first category so the detail panel is never empty on load.
  const [selectedService, setSelectedService] = useState<Service | null>(() => {
    if (preselected?.service) return preselected.service;
    const firstCategory = getCategoriesByPlatform(initialFilter)[0];
    return firstCategory ? (getServicesByCategory(firstCategory.id)[0] ?? null) : null;
  });
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | undefined>(
    preselected?.platform
  );

  function handlePlatformChange(next: string) {
    // OrderForm is keyed by platformFilter, so it remounts and re-selects the first
    // category/service for the new platform and reports it back through onServiceChange.
    setPlatformFilter(next);
    setSelectedPlatform(undefined);
    const firstCategory = getCategoriesByPlatform(next)[0];
    setSelectedService(
      firstCategory ? (getServicesByCategory(firstCategory.id)[0] ?? null) : null
    );
  }

  return (
    <div className="space-y-6">
      <HeaderZone />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <WelcomeHeader username={username} />
      </motion.div>

      <AnnouncementBanners items={announcements} userKey={username} />

      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-[16px]">
        <HeaderLine />
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.06, ease: "easeOut" }}
          >
            <StatCard {...stat} />
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.15, ease: "easeOut" }}
      >
        <PlatformFilter value={platformFilter} onChange={handlePlatformChange} />
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2, ease: "easeOut" }}
        >
          <OrderForm
            key={platformFilter}
            platformFilter={platformFilter}
            preselectService={platformFilter === initialFilter ? preselected?.service : undefined}
            onServiceChange={(service, platform) => {
              setSelectedService(service);
              setSelectedPlatform(platform);
            }}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.25, ease: "easeOut" }}
          className="h-full"
        >
          <ServiceDetail service={selectedService} platform={selectedPlatform} />
        </motion.div>
      </div>
    </div>
  );
}
