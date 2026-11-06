"use client";

import { useId, useState } from "react";
import { Ban, Check, Clock, Crown, Hourglass, Lock, TriangleAlert, X } from "lucide-react";
import type { DepositStatus, ProviderStatus, ReviewStatus, UserRank, UserStatus } from "@/lib/admin-data";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { orderStatusLabels, type OrderStatus } from "@/lib/orders-data";

const icon = "h-3.5 w-3.5";

/** A blocked account that still has a balance also shows "Saldo ditahan" (the block never touches the balance). */
export function UserStatusChip({ status, balance = 0 }: { status: UserStatus; balance?: number }) {
  if (status === "aktif") {
    return (
      <StatusChip label="Aktif" tone="emerald">
        <Check aria-hidden className={icon} />
      </StatusChip>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusChip label="Diblokir" tone="red">
        <Ban aria-hidden className={icon} />
      </StatusChip>
      {balance > 0 ? (
        <span data-testid="held-balance-badge" className="inline-flex">
          <StatusChip label="Saldo ditahan" tone="amber">
            <Lock aria-hidden className={icon} />
          </StatusChip>
        </span>
      ) : null}
    </span>
  );
}

const rankTone: Record<UserRank, ChipTone> = { Starter: "slate", Silver: "sky", Gold: "amber", Reseller: "purple" };

export function RankChip({ rank }: { rank: UserRank }) {
  return (
    <StatusChip label={rank} tone={rankTone[rank]}>
      {rank === "Reseller" || rank === "Gold" ? <Crown aria-hidden className={icon} /> : null}
    </StatusChip>
  );
}

const depositTone: Record<DepositStatus, ChipTone> = { menunggu: "amber", berhasil: "emerald", gagal: "red", kedaluwarsa: "slate", dibatalkan: "slate" };
const depositLabel: Record<DepositStatus, string> = { menunggu: "Menunggu", berhasil: "Berhasil", gagal: "Gagal", kedaluwarsa: "Kedaluwarsa", dibatalkan: "Dibatalkan" };

export function DepositStatusChip({ status }: { status: DepositStatus }) {
  const Icon = status === "berhasil" ? Check : status === "gagal" ? X : status === "menunggu" ? Clock : Hourglass;
  return (
    <StatusChip label={depositLabel[status]} tone={depositTone[status]}>
      <Icon aria-hidden className={icon} />
    </StatusChip>
  );
}

const reviewTone: Record<ReviewStatus, ChipTone> = { menunggu: "amber", selesai: "emerald", ditolak: "red" };
const reviewLabel: Record<ReviewStatus, string> = { menunggu: "Menunggu", selesai: "Selesai", ditolak: "Ditolak" };
const reviewTooltip: Record<ReviewStatus, string> = {
  menunggu: "menunggu diproses",
  selesai: "selesai, saldo sudah dikembalikan",
  ditolak: "ditolak",
};

/** REFUND status: colored chip with icon. Only 3 states: Menunggu, Selesai, Ditolak. */
export function RefundReviewChip({ review }: { review: ReviewStatus }) {
  const Icon = review === "selesai" ? Check : review === "ditolak" ? X : Clock;
  return (
    <StatusChip label={reviewLabel[review]} tone={reviewTone[review]}>
      <Icon aria-hidden className={icon} />
    </StatusChip>
  );
}

/** ORDER status of the refunded order: deliberately neutral (grey, no icon) so it cannot be read as the refund status. */
export function OrderStateChip({ status }: { status: OrderStatus }) {
  return (
    <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-slate-100 px-3 text-[10px] font-medium whitespace-nowrap text-slate-600 dark:bg-[#1B2733] dark:text-[#8FA1B5]">
      {orderStatusLabels[status]}
    </span>
  );
}

/** Tiny 9px label + chip with a title attribute and a keyboard-reachable tooltip. */
function LabeledChip({ label, tooltip, children }: { label: string; tooltip: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex items-center gap-1.5">
      <span aria-hidden className="text-[9px] font-medium text-[#5B6B8C] dark:text-slate-400">
        {label}
      </span>
      <span
        tabIndex={0}
        role="group"
        title={tooltip}
        aria-label={tooltip}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {children}
      </span>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-max max-w-[240px] rounded-lg bg-[#0b0f14] px-2.5 py-1.5 text-[10px] leading-snug font-medium text-white shadow-lg dark:border dark:border-slate-600"
        >
          {tooltip}
        </span>
      ) : null}
    </span>
  );
}

/** The two statuses of a refund row, labeled and visually distinct. */
export function RefundStatusPair({ orderStatus, review }: { orderStatus: OrderStatus; review: ReviewStatus }) {
  return (
    <>
      <LabeledChip label="Pesanan" tooltip={`Status pesanan: ${orderStatusLabels[orderStatus].toLowerCase()}`}>
        <OrderStateChip status={orderStatus} />
      </LabeledChip>
      <LabeledChip label="Refund" tooltip={`Status refund: ${reviewTooltip[review]}`}>
        <RefundReviewChip review={review} />
      </LabeledChip>
    </>
  );
}

export function ProviderStatusChip({ status }: { status: ProviderStatus }) {
  return status === "aktif" ? (
    <StatusChip label="Aktif" tone="emerald">
      <Check aria-hidden className={icon} />
    </StatusChip>
  ) : (
    <StatusChip label="Nonaktif" tone="slate">
      <Ban aria-hidden className={icon} />
    </StatusChip>
  );
}

export function LowBalanceChip() {
  return (
    <StatusChip label="Saldo rendah" tone="amber">
      <TriangleAlert aria-hidden className={icon} />
    </StatusChip>
  );
}

export function ActiveChip({ active }: { active: boolean }) {
  return active ? (
    <StatusChip label="Aktif" tone="emerald">
      <Check aria-hidden className={icon} />
    </StatusChip>
  ) : (
    <StatusChip label="Nonaktif" tone="slate">
      <Ban aria-hidden className={icon} />
    </StatusChip>
  );
}
