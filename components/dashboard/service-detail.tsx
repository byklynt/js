"use client";

import { Activity, Shapes, ShieldCheck, PackageSearch } from "lucide-react";
import type { Platform, Service } from "@/lib/dashboard-data";
import { getServiceTitle, platforms } from "@/lib/dashboard-data";
import { ruleKeyFor } from "@/lib/order-rules";
import { formatQtyRange, isNoLimit } from "@/lib/service-format";
import { useOrderRules } from "@/lib/order-rules-client";
import { OrderRulesCard } from "./order-rules-card";

function formatCompact(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}K` : String(value);
}

function buildDescription(service: Service, platform: Platform | undefined) {
  const items: { emoji: string; text: string }[] = [
    { emoji: "⚡", text: `Mulai: ${service.startTime}` },
  ];
  items.push(
    service.guarantee.startsWith("Non Drop")
      ? { emoji: "🚀⭐", text: "Non Drop — garansi 100%" }
      : { emoji: "🛡️", text: `Garansi: ${service.guarantee}` }
  );
  items.push({ emoji: "🔴", text: "Auto cancel aktif" });
  items.push({ emoji: "📊", text: `Maks: ${isNoLimit(service.max) ? "Tanpa batas" : formatCompact(service.max)}` });
  items.push({ emoji: "🔗", text: `Link: ${service.linkFormat}` });
  if (service.refillDays) {
    items.push({
      emoji: "🔄",
      text: `Refill otomatis tersedia selama ${service.refillDays} hari jika terjadi penurunan`,
    });
  }

  const pinned =
    platform?.id === "telegram"
      ? [
          { emoji: "📌", text: "Link postingan — views ditambahkan ke postingan itu." },
          { emoji: "📌", text: "Username channel — views ditambahkan ke postingan terbaru." },
        ]
      : [];

  return { items, pinned };
}

function Row({ emoji, text }: { emoji: string; text: string }) {
  return (
    <li className="flex items-start gap-1.5">
      <span aria-hidden className="shrink-0">
        {emoji}
      </span>
      {text}
    </li>
  );
}

export function ServiceDetail({
  service,
  platform: platformProp,
}: {
  service: Service | null;
  platform: Platform | undefined;
}) {
  const { rules, policy } = useOrderRules();
  if (!service) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-[20px] border border-slate-200/80 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-accent dark:bg-primary-950/60 dark:text-primary-300">
          <PackageSearch className="h-6 w-6" />
        </span>
        <p className="mt-5 text-[11px] font-semibold text-ink dark:text-slate-100">
          Pilih layanan untuk melihat detail
        </p>
        <p className="mt-1.5 max-w-xs text-[10px] font-medium text-[#5B6B8C] dark:text-slate-400">
          Detail kecepatan, estimasi, dan deskripsi layanan akan muncul di sini.
        </p>
      </div>
    );
  }

  // Categories such as "Layanan Baru" have no platform; infer it from the service name.
  const platform =
    platformProp ??
    platforms.find((p) => service.name.toLowerCase().includes(p.label.toLowerCase()));
  const perDay = service.badges.find((b) => /\/hari/i.test(b));
  const speed = service.speedPerHour <= 0 ? "Bervariasi" : `${formatCompact(service.speedPerHour)}/jam${perDay ? ` (${perDay.replace(/\/Hari/i, "/hari")})` : ""}`;
  const { items, pinned } = buildDescription(service, platform);
  const rule = rules[ruleKeyFor(platform?.id)];

  return (
    <div className="flex h-full flex-col rounded-[20px] border border-slate-200/80 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="bg-gradient-to-b from-primary-soft to-white px-6 pt-5 pb-5 text-center dark:to-slate-900">
          {platform ? (
            <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-white text-primary-accent shadow-sm dark:bg-[#0B1620]">
              <platform.icon className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <h3 className="mt-3 text-[13px] font-normal text-ink dark:text-white">
            {service.id} - {getServiceTitle(service)} - Rp {service.pricePer1000.toLocaleString("id-ID")}
          </h3>
          <p className="mt-2 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
            &bull; ID Produk: {service.id} &nbsp;&bull; Estimasi:{" "}
            <span className="text-primary-accent">{service.estimate}</span> &nbsp;&bull;{" "}
            <span className="text-primary-accent">Layanan</span> Penyedia Terpercaya
          </p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-200/70 border-t border-slate-200/70 dark:divide-slate-800 dark:border-slate-800">
          <div className="flex flex-col items-center gap-1 px-2 py-4 text-center">
            <Activity className="h-5 w-5 stroke-[1.75] text-emerald-500" />
            <p className="mt-1 text-[11px] font-medium text-ink dark:text-slate-100">
              Kecepatan Layanan
            </p>
            <p className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">{speed}</p>
          </div>
          <div className="flex flex-col items-center gap-1 px-2 py-4 text-center">
            <Shapes className="h-5 w-5 stroke-[1.75] text-red-500" />
            <p className="mt-1 text-[11px] font-medium text-ink dark:text-slate-100">Min - Maks</p>
            <p className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
              {formatQtyRange(service.min, service.max)}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 px-2 py-4 text-center">
            <ShieldCheck className="h-5 w-5 stroke-[1.75] text-primary-accent" />
            <p className="mt-1 text-[11px] font-medium text-ink dark:text-slate-100">Garansi</p>
            <p className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
              {service.guarantee.startsWith("Non Drop") ? "-" : service.guarantee}
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200/70 px-5 py-4 dark:border-slate-800">
          <p className="text-[12px] font-semibold text-ink dark:text-slate-100">Deskripsi</p>
          <ul className="mt-2.5 space-y-1.5 text-[10px] leading-snug text-[#2B3A5C] dark:text-slate-300">
            {items.map((item) => (
              <Row key={item.text} {...item} />
            ))}
          </ul>

          {pinned.length > 0 ? (
            <ul className="mt-4 space-y-1.5 text-[10px] leading-snug text-[#2B3A5C] dark:text-slate-300">
              {pinned.map((item) => (
                <Row key={item.text} {...item} />
              ))}
            </ul>
          ) : null}

          <ul className="mt-4 space-y-1.5 text-[10px] leading-snug text-[#2B3A5C] dark:text-slate-300">
            <Row
              emoji="⚠️"
              text="Jangan order dua kali untuk link yang sama sebelum order pertama selesai."
            />
            <Row emoji="💬" text="Ada masalah dengan ordermu? Hubungi support." />
          </ul>
        </div>
      </div>
      <OrderRulesCard rule={rule} policy={policy} />
    </div>
  );
}
