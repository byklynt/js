import type { Service } from "@/lib/dashboard-data";

const descriptionEmoji = ["⚡", "🚀⭐", "🔴", "📊", "🔗", "🔄"];

export function ServiceDescription({ service }: { service: Service }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-ink dark:text-slate-100">
        <span aria-hidden>✨</span>
        Deskripsi
      </p>
      <ul className="mt-3 space-y-2">
        {service.description.map((line, i) => (
          <li
            key={line}
            className="flex items-start gap-2 text-[10.5px] leading-relaxed text-slate-500 dark:text-slate-400"
          >
            <span aria-hidden className="shrink-0">
              {descriptionEmoji[i] ?? descriptionEmoji[descriptionEmoji.length - 1]}
            </span>
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-2 border-t border-slate-200/70 pt-4 dark:border-slate-800">
        <p className="flex items-start gap-2 text-[9.5px] leading-relaxed font-medium text-amber-600 dark:text-amber-300">
          <span aria-hidden>⚠️</span>
          Jangan order dua kali untuk link yang sama sebelum pesanan sebelumnya
          selesai.
        </p>
        <p className="flex items-start gap-2 text-[9.5px] leading-relaxed font-medium text-amber-600 dark:text-amber-300">
          <span aria-hidden>💬</span>
          Ada masalah dengan pesananmu? Hubungi tim support kami.
        </p>
      </div>
    </div>
  );
}
