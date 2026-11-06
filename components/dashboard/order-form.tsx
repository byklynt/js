"use client";

import { chooseEstimate } from "@/lib/service-estimate";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Loader2,
  Search,
  Send,
  ShoppingCart,
} from "lucide-react";
import {
  platforms,
  formatRupiah,
  getServiceFullName,
  allPlatformsId,
  type Service,
  type Platform,
} from "@/lib/dashboard-data";
import type { CategoryRow, ServiceRow } from "@/lib/services-types";
import { fetchServices, isAbort, rowToService, useCategories } from "@/lib/services-client";
import { formatMaxQty, formatQtyRange } from "@/lib/service-format";
import { createOrder } from "@/lib/dashboard-actions";
import { ImpliedAcceptanceNote } from "./order-rules-card";
import { isValidLink } from "@/lib/validation";
import { MassOrderForm } from "@/components/massorder/mass-order-form";
import { CustomSelect } from "@/components/ui/select";
import { FormAlert, type AlertState } from "@/components/shared/form-alert";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/provider";
import { MIN_SERVICE_SEARCH, normalizeServiceSearch } from "@/lib/search-text";
import { analyzeComments, commentsError, commentsPrice, MAX_COMMENT_LENGTH } from "@/lib/comments";

function platformForCategory(category: CategoryRow | null): Platform | undefined {
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
      {service.kind === "unsupported" ? (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">Belum tersedia</span>
      ) : null}
    </span>
  );
}

function CategoryLabel({ category }: { category: CategoryRow }) {
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

const OPTIONS_LIMIT = 100;

export function OrderForm({
  platformFilter,
  preselectService,
  preselectCategory,
  hasServices,
  onServiceChange,
}: {
  platformFilter: string;
  preselectService?: Service;
  preselectCategory?: CategoryRow | null;
  /** Computed on the server: whether any service exists at all (avoids flashing an empty state while categories load). */
  hasServices: boolean;
  onServiceChange: (service: Service | null, platform: Platform | undefined) => void;
}) {
  const { t: tx } = useLanguage();
  const [tab, setTab] = useState<Tab>("baru");
  const catalog = useCategories();
  const [category, setCategory] = useState<CategoryRow | null>(preselectCategory ?? null);
  const [service, setService] = useState<Service | null>(preselectService ?? null);
  // Until the user picks something, the first category and its first service are selected (once they have loaded).
  const autoPick = useRef(!preselectService);
  const [serviceOptions, setServiceOptions] = useState<Service[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsSearch, setOptionsSearch] = useState("");
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");
  const [comments, setComments] = useState("");
  const [errors, setErrors] = useState<{ link?: string; quantity?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ServiceRow[]>([]);
  const [searching, setSearching] = useState(false);

  const linkId = useId();
  const quantityId = useId();
  const commentsId = useId();
  const linkErrorId = useId();
  const quantityErrorId = useId();

  const categoryOptions = useMemo(
    () => (platformFilter === allPlatformsId ? catalog.categories : catalog.categories.filter((c) => c.platformId === platformFilter)),
    [platformFilter, catalog.categories]
  );

  // First category of the platform, once the category list has arrived.
  useEffect(() => {
    if (!autoPick.current || category || categoryOptions.length === 0) return;
    setCategory(categoryOptions[0]);
  }, [categoryOptions, category]);

  // Services of the selected category only, fetched on demand (and again, server side, when the dropdown search changes).
  const categoryId = category?.id;
  useEffect(() => {
    if (!categoryId) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptionsLoading(true);
    fetchServices({ category: categoryId, search: optionsSearch || undefined, sort: "id-asc", limit: OPTIONS_LIMIT }, ctrl.signal)
      .then((page) => {
        const list = page.items.map(rowToService);
        setServiceOptions(list);
        setOptionsLoading(false);
        if (autoPick.current && list[0]) {
          autoPick.current = false;
          setService(list[0]);
          onServiceChange(list[0], platformForCategory(category));
        }
      })
      .catch((e) => {
        if (!isAbort(e)) setOptionsLoading(false);
      });
    return () => ctrl.abort();
    // onServiceChange and category (read only for its platform) are intentionally not dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, optionsSearch]);

  useEffect(() => {
    if (service) onServiceChange(service, platformForCategory(category));
    // Notify the parent of the pre-selected service once on mount.
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

  function handleCategoryChange(next: CategoryRow) {
    autoPick.current = false;
    setCategory(next);
    setServiceOptions([]);
    setOptionsSearch("");
    setService(null);
    onServiceChange(null, platformForCategory(next));
  }

  function handleServiceChange(next: Service) {
    setService(next);
    setQuantity("");
    setComments("");
    setErrors({});
    onServiceChange(next, platformForCategory(category));
  }

  function selectServiceFromSearch(row: ServiceRow) {
    const next = rowToService(row);
    const cat = catalog.categories.find((c) => c.id === next.categoryId) ?? null;
    autoPick.current = false;
    setCategory(cat);
    setServiceOptions([]);
    setOptionsSearch("");
    setService(next);
    setQuantity("");
    setComments("");
    setErrors({});
    onServiceChange(next, platformForCategory(cat));
    setTab("baru");
    setSearchQuery("");
  }

  const isComments = service?.kind === "comments";
  const notOrderable = service?.kind === "unsupported";
  // Custom Comments: the quantity is the number of non-empty lines (computed here for the form; place_order recomputes it).
  const commentsInfo = useMemo(() => analyzeComments(comments), [comments]);
  const searchTerm = normalizeServiceSearch(searchQuery);
  const quantityNumber = isComments ? commentsInfo.count : Number(quantity.replace(/[^\d]/g, ""));
  // Delivery estimate for the chosen quantity bucket (service-wide until a quantity is typed or while the bucket has too few samples).
  const estimate = chooseEstimate(service?.est, quantityNumber > 0 ? quantityNumber : null);
  const subtotal = isComments
    ? service && commentsInfo.count > 0 ? commentsPrice(service.pricePer1000, commentsInfo.count) : 0
    : service && quantity && Number.isFinite(quantityNumber)
      ? (service.pricePer1000 * quantityNumber) / 1000
      : 0;

  function validate(): boolean {
    const next: { link?: string; quantity?: string } = {};

    if (!isValidLink(link)) {
      next.link = "Masukkan link yang valid atau username diawali @.";
    }

    if (!service) {
      next.quantity = "Pilih layanan terlebih dahulu.";
    } else if (notOrderable) {
      next.quantity = "Layanan ini belum tersedia untuk dipesan.";
    } else if (isComments) {
      const problem = commentsError(commentsInfo, service.min, service.max);
      if (problem) next.quantity = problem;
    } else if (!quantity || !Number.isFinite(quantityNumber) || quantityNumber <= 0) {
      next.quantity = "Jumlah wajib diisi.";
    } else if (quantityNumber < service.min || quantityNumber > service.max) {
      next.quantity = `Jumlah harus antara ${formatQtyRange(service.min, service.max)}.`;
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
        ...(isComments ? { comments } : {}),
      });
      if (result.success) {
        setAlert({ type: "success", message: "Pesanan berhasil dibuat!" });
        setLink("");
        setQuantity("");
        setComments("");
      } else {
        setAlert({ type: "error", message: result.message });
      }
    } catch {
      setAlert({ type: "error", message: "Gagal membuat pesanan. Coba lagi." });
    } finally {
      setSubmitting(false);
    }
  }

  // "Cari" tab: server-side search, debounced 300 ms, stale requests cancelled, at least 2 characters.
  useEffect(() => {
    const query = normalizeServiceSearch(searchQuery);
    if (tab !== "cari" || query.length < MIN_SERVICE_SEARCH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      // Typed text searches ALL platforms and categories (our service ID or the name), not only the platform chip that is selected above.
      fetchServices({ search: query, sort: "id-asc", limit: 20 }, ctrl.signal)
        .then((page) => {
          setSearchResults(page.items);
          setSearching(false);
        })
        .catch((e) => {
          if (!isAbort(e)) setSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [searchQuery, tab]);

  // No service at all (for example live mode before the first provider sync): say so instead of an empty dropdown.
  if (!hasServices && catalog.loaded && catalog.total === 0) {
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
            searchable
            getSearchText={(c) => c.label}
            loading={!catalog.loaded}
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
            searchable
            onSearch={setOptionsSearch}
            loading={optionsLoading}
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
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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

          {notOrderable ? (
            <p role="status" data-testid="not-orderable" className="rounded-[10px] border border-dashed border-slate-300 px-3 py-2.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Belum tersedia untuk dipesan
            </p>
          ) : null}

          {isComments ? (
            <div>
              <label htmlFor={commentsId} className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200">
                Komentar (satu komentar per baris)
              </label>
              <textarea
                id={commentsId}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={6}
                placeholder={"Contoh:\nKeren banget!\nMantap, lanjutkan"}
                aria-invalid={Boolean(errors.quantity)}
                aria-describedby={quantityErrorId}
                className={cn(
                  "w-full resize-y rounded-[10px] border bg-white px-3 py-2 text-[10px] leading-relaxed text-ink outline-none transition placeholder:text-slate-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:ring-primary-900/40",
                  errors.quantity ? "border-red-300 focus:border-red-400 focus:ring-red-100 dark:border-red-900" : "border-slate-200 dark:border-slate-700"
                )}
              />
              <p data-testid="comments-count" className="mt-1.5 text-[10px] font-semibold text-ink dark:text-slate-100">
                Jumlah: {commentsInfo.count.toLocaleString("id-ID")} komentar
              </p>
              {errors.quantity ? (
                <p id={quantityErrorId} className="mt-1.5 text-[9.5px] font-medium text-red-500">
                  {errors.quantity}
                </p>
              ) : (
                <p id={quantityErrorId} className="mt-1.5 text-[9.5px] text-slate-400">
                  {service
                    ? `Min: ${service.min.toLocaleString("id-ID")} - Maks: ${formatMaxQty(service.max)} komentar${
                        commentsInfo.count > service.max
                          ? ` • Kelebihan ${(commentsInfo.count - service.max).toLocaleString("id-ID")}`
                          : commentsInfo.count > 0 && commentsInfo.count < service.min
                            ? ` • Kurang ${(service.min - commentsInfo.count).toLocaleString("id-ID")}`
                            : ` • Sisa ${Math.max(0, service.max - commentsInfo.count).toLocaleString("id-ID")}`
                      } • Maks ${MAX_COMMENT_LENGTH} karakter per komentar`
                    : ""}
                  {service ? (
                    <>
                      <span aria-hidden> &bull; </span>
                      <span data-estimate data-testid="order-estimate" title={estimate.note ?? undefined}>
                        {estimate.kind === "none" ? estimate.text : `Estimasi: ${estimate.text}`}
                      </span>
                    </>
                  ) : null}
                </p>
              )}
              {commentsInfo.duplicates > 0 ? (
                <p role="status" className="mt-1 text-[9.5px] font-medium text-amber-600 dark:text-amber-400">
                  {commentsInfo.duplicates} komentar sama dengan komentar lain. Komentar yang berulang bisa ditolak atau dianggap spam oleh platform.
                </p>
              ) : null}
            </div>
          ) : (
            <>
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
                    ? `Min: ${service.min.toLocaleString("id-ID")} - Maks: ${formatMaxQty(service.max)}`
                    : "Pilih layanan untuk melihat batas jumlah"}
                  {service ? (
                    <>
                      <span aria-hidden> &bull; </span>
                      <span data-estimate data-testid="order-estimate" title={estimate.note ?? undefined}>
                        {estimate.kind === "none" ? estimate.text : `Estimasi: ${estimate.text}`}
                      </span>
                    </>
                  ) : null}
                </p>
              )}
            </div>

            </>
          )}

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
              disabled={submitting || !service || notOrderable}
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
              placeholder="Cari ID atau nama layanan..."
              aria-label="Cari layanan berdasarkan ID atau nama"
              className="h-[34px] w-full rounded-[10px] border border-slate-200 bg-white pl-9 pr-3 text-[10px] text-ink outline-none transition placeholder:text-slate-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-primary-900/40"
            />
          </div>

          <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
            {searchTerm.length >= MIN_SERVICE_SEARCH && searching && searchResults.length === 0 ? (
              <li role="status" className="px-2 py-6 text-center text-[10.5px] text-slate-400">
                Mencari...
              </li>
            ) : searchTerm.length >= MIN_SERVICE_SEARCH && searchResults.length === 0 ? (
              <li data-testid="search-empty" className="px-2 py-6 text-center text-[10.5px] text-slate-400">
                Tidak ada hasil
              </li>
            ) : searchTerm.length < MIN_SERVICE_SEARCH && searchTerm ? (
              <li className="px-2 py-6 text-center text-[10.5px] text-slate-400">
                Ketik minimal 2 karakter.
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
                      {getServiceFullName(rowToService(s))}
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
