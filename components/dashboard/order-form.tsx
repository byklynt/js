"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  ClipboardList,
  Loader2,
  Search,
  Send,
  ShoppingCart,
} from "lucide-react";
import {
  categories,
  platforms,
  services,
  getCategoriesByPlatform,
  getServicesByCategory,
  formatRupiah,
  getServiceFullName,
  allPlatformsId,
  type Category,
  type Service,
  type Platform,
} from "@/lib/dashboard-data";
import { createOrder } from "@/lib/dashboard-actions";
import { ImpliedAcceptanceNote } from "./order-rules-card";
import { isValidLink } from "@/lib/validation";
import { MassOrderForm } from "@/components/massorder/mass-order-form";
import { CustomSelect } from "@/components/ui/select";
import { FormAlert, type AlertState } from "@/components/shared/form-alert";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/provider";

function platformForCategory(category: Category | null): Platform | undefined {
  if (!category) return undefined;
  return platforms.find((p) => p.id === category.platformId);
}

function IdBadge({ id }: { id: string }) {
  return (
    <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[9px] font-semibold text-primary-accent">
      {id}
    </span>
  );
}

function ServiceLabel({ service }: { service: Service }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <IdBadge id={service.id} />
      <span className="min-w-0 flex-1 truncate">{getServiceFullName(service)}</span>
    </span>
  );
}

function CategoryLabel({ category }: { category: Category }) {
  const platform = platformForCategory(category);
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-50 text-[11px] leading-none text-primary-accent dark:bg-slate-800">
        {category.id === "cat-new" ? (
          <span aria-hidden>🔥</span>
        ) : platform ? (
          <platform.icon className="h-3 w-3" />
        ) : null}
      </span>
      {category.label}
    </span>
  );
}

type Tab = "baru" | "cari" | "massal";

const tabs: { id: Tab; label: string }[] = [
  { id: "baru", label: "Order Baru" },
  { id: "cari", label: "Cari" },
  { id: "massal", label: "Order Massal" },
];

export function OrderForm({
  platformFilter,
  preselectService,
  onServiceChange,
}: {
  platformFilter: string;
  preselectService?: Service;
  onServiceChange: (service: Service | null, platform: Platform | undefined) => void;
}) {
  const { t: tx } = useLanguage();
  const [tab, setTab] = useState<Tab>("baru");
  const [category, setCategory] = useState<Category | null>(() => {
    if (preselectService) {
      return categories.find((c) => c.id === preselectService.categoryId) ?? null;
    }
    return getCategoriesByPlatform(platformFilter)[0] ?? null;
  });
  const [service, setService] = useState<Service | null>(() => {
    if (preselectService) return preselectService;
    const firstCategory = getCategoriesByPlatform(platformFilter)[0];
    return firstCategory ? getServicesByCategory(firstCategory.id)[0] ?? null : null;
  });
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");
  const [errors, setErrors] = useState<{ link?: string; quantity?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const linkId = useId();
  const quantityId = useId();
  const linkErrorId = useId();
  const quantityErrorId = useId();

  const categoryOptions = useMemo(
    () => getCategoriesByPlatform(platformFilter),
    [platformFilter]
  );
  const serviceOptions = useMemo(
    () => (category ? getServicesByCategory(category.id) : []),
    [category]
  );

  useEffect(() => {
    onServiceChange(service, platformForCategory(category));
    // Notify the parent of the default pre-selected service once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [lastPlatformFilter, setLastPlatformFilter] = useState(platformFilter);
  if (platformFilter !== lastPlatformFilter) {
    setLastPlatformFilter(platformFilter);
    if (
      platformFilter !== allPlatformsId &&
      category &&
      category.platformId !== platformFilter
    ) {
      setCategory(null);
      setService(null);
    }
  }

  function handleCategoryChange(next: Category) {
    setCategory(next);
    setService(null);
    onServiceChange(null, platformForCategory(next));
  }

  function handleServiceChange(next: Service) {
    setService(next);
    setQuantity("");
    setErrors({});
    onServiceChange(next, platformForCategory(category));
  }

  function selectServiceFromSearch(next: Service) {
    const cat = categories.find((c) => c.id === next.categoryId) ?? null;
    setCategory(cat);
    setService(next);
    setQuantity("");
    setErrors({});
    onServiceChange(next, platformForCategory(cat));
    setTab("baru");
    setSearchQuery("");
  }

  const quantityNumber = Number(quantity.replace(/[^\d]/g, ""));
  const subtotal =
    service && quantity && Number.isFinite(quantityNumber)
      ? (service.pricePer1000 * quantityNumber) / 1000
      : 0;

  function validate(): boolean {
    const next: { link?: string; quantity?: string } = {};

    if (!isValidLink(link)) {
      next.link = "Masukkan link yang valid atau username diawali @.";
    }

    if (!service) {
      next.quantity = "Pilih layanan terlebih dahulu.";
    } else if (!quantity || !Number.isFinite(quantityNumber) || quantityNumber <= 0) {
      next.quantity = "Jumlah wajib diisi.";
    } else if (quantityNumber < service.min || quantityNumber > service.max) {
      next.quantity = `Jumlah harus antara ${service.min.toLocaleString("id-ID")} - ${service.max.toLocaleString("id-ID")}.`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (!validate() || !service) return;

    setSubmitting(true);
    try {
      const result = await createOrder({
        serviceId: service.id,
        link,
        quantity: quantityNumber,
      });
      if (result.success) {
        setAlert({ type: "success", message: "Pesanan berhasil dibuat!" });
        setLink("");
        setQuantity("");
      } else {
        setAlert({ type: "error", message: result.message });
      }
    } catch {
      setAlert({ type: "error", message: "Gagal membuat pesanan. Coba lagi." });
    } finally {
      setSubmitting(false);
    }
  }

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const pool =
      platformFilter === allPlatformsId
        ? services
        : services.filter((s) => {
            const cat = categories.find((c) => c.id === s.categoryId);
            return cat?.platformId === platformFilter;
          });
    return pool.filter((s) => s.name.toLowerCase().includes(query)).slice(0, 20);
  }, [searchQuery, platformFilter]);

  // No service at all (for example live mode before the first provider sync): say so instead of an empty dropdown.
  if (services.length === 0) {
    return (
      <div className="rounded-[20px] border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-primary-50 text-primary-accent dark:border-primary-900 dark:bg-primary-950/60">
            <ClipboardList className="h-4 w-4 stroke-[1.75]" />
          </span>
          <h2 className="text-[12px] font-medium tracking-tight text-ink dark:text-white">{tx("order.createTitle")}</h2>
        </div>
        <div role="status" className="mt-4 rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-[11px] font-semibold text-ink dark:text-slate-200">{tx("order.noServices")}</p>
          <p className="mt-1 text-[10px] text-[#5B6B8C] dark:text-slate-400">{tx("order.noServicesHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-primary-50 text-primary-accent dark:border-primary-900 dark:bg-primary-950/60">
          <ClipboardList className="h-4 w-4 stroke-[1.75]" />
        </span>
        <h2 className="text-[12px] font-medium tracking-tight text-ink dark:text-white">
          Buat pesanan
        </h2>
      </div>

      <div
        role="tablist"
        className="mt-4 flex h-10 items-center gap-7 rounded-xl bg-[#F1F6FB] px-1 dark:bg-[#161b20]"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "text-[9.5px] font-medium transition",
              tab === t.id
                ? "rounded-[9px] border border-slate-200 bg-white px-4 py-2 text-primary-accent shadow-sm dark:border-transparent dark:bg-primary-solid dark:text-white"
                : "px-1 py-2 text-[#5B6B8C] hover:text-ink dark:text-white"
            )}
          >
            {tx(t.id === "baru" ? "order.tabNew" : t.id === "cari" ? "order.tabSearch" : "order.tabMass")}
          </button>
        ))}
      </div>

      {tab === "baru" ? (
        <form noValidate onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <FormAlert state={alert} />

          <CustomSelect
            label={tx("order.category")}
            options={categoryOptions}
            value={category}
            onChange={handleCategoryChange}
            getKey={(c) => c.id}
            placeholder={tx("order.pickCategory")}
            renderValue={(c) => <CategoryLabel category={c} />}
            renderOption={(c) => <CategoryLabel category={c} />}
          />

          <CustomSelect
            label={tx("order.service")}
            options={serviceOptions}
            value={service}
            onChange={handleServiceChange}
            getKey={(s) => s.id}
            placeholder={category ? "Pilih layanan" : "Pilih kategori terlebih dahulu"}
            disabled={!category}
            renderValue={(s) => <ServiceLabel service={s} />}
            renderOption={(s) => <ServiceLabel service={s} />}
          />

          <div>
            <label
              htmlFor={linkId}
              className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200"
            >
              Link
            </label>
            <input
              id={linkId}
              type="text"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Tempel link postingan atau profil"
              aria-invalid={Boolean(errors.link)}
              aria-describedby={errors.link ? linkErrorId : undefined}
              className={cn(
                "h-[34px] w-full rounded-[10px] border bg-white px-3 text-[10px] text-ink outline-none transition placeholder:text-slate-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:ring-primary-900/40",
                errors.link
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100 dark:border-red-900"
                  : "border-slate-200 dark:border-slate-700"
              )}
            />
            {errors.link ? (
              <p id={linkErrorId} className="mt-1.5 text-[9.5px] font-medium text-red-500">
                {errors.link}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor={quantityId}
              className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200"
            >
              {tx("order.quantity")}
            </label>
            <input
              id={quantityId}
              type="text"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Masukkan jumlah"
              aria-invalid={Boolean(errors.quantity)}
              aria-describedby={errors.quantity ? quantityErrorId : undefined}
              disabled={!service}
              className={cn(
                "h-[34px] w-full rounded-[10px] border bg-white px-3 text-[10px] text-ink outline-none transition placeholder:text-slate-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:ring-primary-900/40",
                errors.quantity
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100 dark:border-red-900"
                  : "border-slate-200 dark:border-slate-700"
              )}
            />
            {errors.quantity ? (
              <p id={quantityErrorId} className="mt-1.5 text-[9.5px] font-medium text-red-500">
                {errors.quantity}
              </p>
            ) : (
              <p className="mt-1.5 text-[9.5px] text-slate-400">
                {service
                  ? `Min: ${service.min.toLocaleString("id-ID")} - Maks: ${service.max.toLocaleString("id-ID")}`
                  : "Pilih layanan untuk melihat batas jumlah"}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 px-1.5 dark:border-slate-700 sm:flex-1">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border border-primary-100 bg-primary-50 text-primary-accent dark:border-slate-700 dark:bg-slate-800">
                <ShoppingCart className="h-3.5 w-3.5 stroke-[1.75]" />
              </span>
              <span className="text-[10px] font-semibold text-ink dark:text-slate-100">{tx("order.subtotal")}</span>
              <span className="ml-1 min-w-0 flex-1 truncate text-[10px] font-semibold text-ink dark:text-slate-100">
                {formatRupiah(subtotal)}
              </span>
            </div>
            <button
              type="submit"
              disabled={submitting || !service}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary-from to-primary-to text-[10px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 dark:border dark:border-white/25 sm:flex-1"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {tx("order.processing")}
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  {tx("order.submit")}
                </>
              )}
            </button>
          </div>
          <ImpliedAcceptanceNote />
        </form>
      ) : null}

      {tab === "cari" ? (
        <div className="mt-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama layanan..."
              aria-label="Cari layanan"
              className="h-[34px] w-full rounded-[10px] border border-slate-200 bg-white pl-9 pr-3 text-[10px] text-ink outline-none transition placeholder:text-slate-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-primary-900/40"
            />
          </div>

          <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
            {searchQuery.trim() && searchResults.length === 0 ? (
              <li className="px-2 py-6 text-center text-[10.5px] text-slate-400">
                Layanan tidak ditemukan.
              </li>
            ) : (
              searchResults.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => selectServiceFromSearch(s)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-slate-100 px-3 py-2.5 text-left text-[10.5px] transition hover:border-primary-200 hover:bg-primary-50 dark:border-slate-800 dark:hover:border-primary-800 dark:hover:bg-slate-800"
                  >
                    <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[9.5px] font-bold text-primary-accent dark:bg-primary-950/60 dark:text-primary-300">
                      {s.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink dark:text-slate-200">
                      {getServiceFullName(s)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {tab === "massal" ? (
        <div className="mt-4">
          <MassOrderForm />
        </div>
      ) : null}
    </div>
  );
}
