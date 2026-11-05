import { describe, expect, it } from "vitest";
import { mapProviderStatus } from "../rules";
import { mapLikeoStatus } from "../providers/likeo";

const SYNC: Record<string, string> = {
  Pending: "menunggu", "In progress": "berjalan", Processing: "diproses", Completed: "selesai",
  Partial: "sebagian", Canceled: "dibatalkan", Failed: "gagal_kirim",
};
const ADAPTER: Record<string, string> = {
  Pending: "menunggu", "In progress": "berjalan", Processing: "berjalan", Completed: "selesai",
  Partial: "sebagian", Canceled: "dibatalkan", Failed: "gagal",
};

describe("status mapping", () => {
  it.each(Object.entries(SYNC))("sync rule: %s -> %s", (raw, want) => expect(mapProviderStatus(raw)).toBe(want));
  it.each(Object.entries(ADAPTER))("adapter: %s -> %s", (raw, want) => expect(mapLikeoStatus(raw)).toBe(want));
  it.each(["COMPLETED", "  completed ", "In  Progress", "in_progress", "IN-PROGRESS", "inprogress", "Cancelled", "complete"])("tolerates case/spacing: %j", (raw) => {
    expect(mapProviderStatus(raw)).not.toBeNull();
    expect(mapLikeoStatus(raw)).not.toBeNull();
  });
  it("unknown values map to null (the sync logs them instead of ignoring)", () => {
    expect(mapProviderStatus("Waiting for review")).toBeNull();
    expect(mapLikeoStatus("")).toBeNull();
  });
});
