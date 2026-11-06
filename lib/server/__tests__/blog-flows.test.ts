/**
 * Blog against the linked DEV Supabase project: RLS (anon / user / admin), scheduling by published_at, slug rules and the "blog-images" bucket.
 * Run with: npm run test:db  (node scripts/run-db-tests.mjs blog)
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupOrFail } from "../../../scripts/lib/test-cleanup.mjs";

vi.mock("server-only", () => ({}));

const fileEnv: Record<string, string> = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) fileEnv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
for (const [k, v] of Object.entries(fileEnv)) if (process.env[k] === undefined) process.env[k] = v;
const enabled = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

// a 1x1 PNG
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64"));

describe.skipIf(!enabled)("blog: RLS, scheduling, slugs and image bucket", () => {
  const MARKER = "bg";
  const run = MARKER + Math.random().toString(36).slice(2, 7);
  const password = `Blg-${run}-pass1`;
  const s = (n: string) => `zt-${run}-${n}`;
  let db: ReturnType<typeof import("@/lib/server/supabase-admin").supabaseAdmin>;
  let anon: SupabaseClient;
  let userClient: SupabaseClient;
  let adminClient: SupabaseClient;
  const ids: Record<string, string> = {};
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  const client = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const visibleSlugs = async (c: SupabaseClient) => ((await c.from("blog_posts").select("slug").like("slug", `zt-${run}-%`)).data ?? []).map((r) => r.slug).sort();

  beforeAll(async () => {
    const ref = process.env.SUPABASE_DEV_PROJECT_REF;
    if (!ref || new URL(url).hostname !== `${ref}.supabase.co`) throw new Error("Refusing to run: SUPABASE_DEV_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL.");
    db = (await import("@/lib/server/supabase-admin")).supabaseAdmin();
    await cleanupOrFail({ marker: MARKER });
    const mk = async (n: string, role?: "admin") => {
      const username = `zt_${n}_${run}`.slice(0, 24);
      const email = `${username}@jagoansosmed-test.invalid`;
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
      if (error || !data.user) throw new Error(error?.message);
      if (role) await db.from("profiles").update({ role }).eq("id", data.user.id);
      const c = client();
      expect((await c.auth.signInWithPassword({ email, password })).error).toBeNull();
      return { id: data.user.id, c };
    };
    const a = await mk("adm", "admin");
    const u = await mk("usr");
    adminClient = a.c;
    userClient = u.c;
    ids.admin = a.id;
    anon = client();

    // categories / tags: one used by a published post, one only by a draft
    const cats = await db.from("blog_categories").insert([{ slug: s("cat-pub"), name: "Kategori terbit" }, { slug: s("cat-draft"), name: "Kategori draf" }]).select("id,slug");
    const cat = (slug: string) => cats.data!.find((c) => c.slug === slug)!.id;
    const tags = await db.from("blog_tags").insert([{ slug: s("tag-pub"), name: "tag terbit" }, { slug: s("tag-draft"), name: "tag draf" }]).select("id,slug");
    const tag = (slug: string) => tags.data!.find((t) => t.slug === slug)!.id;
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const posts = await db.from("blog_posts").insert([
      { slug: s("published"), title: "Terbit", content_md: "isi", status: "terbit", published_at: past, category_id: cat(s("cat-pub")), author_id: a.id },
      { slug: s("draft"), title: "Draf rahasia", content_md: "isi", status: "draf", category_id: cat(s("cat-draft")), author_id: a.id },
      { slug: s("draft-dated"), title: "Draf bertanggal", content_md: "isi", status: "draf", published_at: past, author_id: a.id },
      { slug: s("scheduled"), title: "Terjadwal", content_md: "isi", status: "terbit", published_at: future, author_id: a.id },
    ]).select("id,slug");
    expect(posts.error).toBeNull();
    for (const p of posts.data!) ids[p.slug.replace(`zt-${run}-`, "")] = p.id;
    await db.from("blog_post_tags").insert([{ post_id: ids.published, tag_id: tag(s("tag-pub")) }, { post_id: ids.draft, tag_id: tag(s("tag-draft")) }]);
  }, 240_000);

  afterAll(async () => {
    await cleanupOrFail({ marker: MARKER });
  }, 300_000);

  it("anon and normal users read ONLY published posts: no draft, no dated draft, no scheduled post", async () => {
    for (const c of [anon, userClient]) expect(await visibleSlugs(c)).toEqual([s("published")]);
    for (const key of ["draft", "draft-dated", "scheduled"]) {
      expect((await anon.from("blog_posts").select("id").eq("id", ids[key])).data).toEqual([]);
      expect((await anon.from("blog_posts").select("id").eq("slug", s(key))).data).toEqual([]);
    }
    // counting does not leak either
    expect((await anon.from("blog_posts").select("id", { count: "exact", head: true }).like("slug", `zt-${run}-%`)).count).toBe(1);
  });

  it("categories, tags and links are visible only through a published post (a draft's topic does not leak)", async () => {
    const cats = ((await anon.from("blog_categories").select("slug").like("slug", `zt-${run}-%`)).data ?? []).map((c) => c.slug);
    expect(cats).toEqual([s("cat-pub")]);
    const tags = ((await anon.from("blog_tags").select("slug").like("slug", `zt-${run}-%`)).data ?? []).map((c) => c.slug);
    expect(tags).toEqual([s("tag-pub")]);
    const links = (await anon.from("blog_post_tags").select("post_id")).data ?? [];
    expect(links.map((l) => l.post_id)).not.toContain(ids.draft);
    expect(links.map((l) => l.post_id)).toContain(ids.published);
  });

  it("anon and normal users cannot write anything", async () => {
    for (const c of [anon, userClient]) {
      const ins = await c.from("blog_posts").insert({ slug: s("hack"), title: "x", content_md: "x", status: "draf" });
      expect(ins.error, "insert").not.toBeNull();
      const upd = await c.from("blog_posts").update({ title: "diubah" }).eq("id", ids.published).select();
      expect(upd.data ?? []).toEqual([]);
      const del = await c.from("blog_posts").delete().eq("id", ids.published).select();
      expect(del.data ?? []).toEqual([]);
      expect((await c.from("blog_categories").insert({ slug: s("hack-cat"), name: "x" })).error).not.toBeNull();
      expect((await c.from("blog_tags").insert({ slug: s("hack-tag"), name: "x" })).error).not.toBeNull();
    }
    const row = (await db.from("blog_posts").select("title,status").eq("id", ids.published).single()).data!;
    expect(row).toEqual({ title: "Terbit", status: "terbit" });
  });

  it("an admin session reads drafts and scheduled posts and can write", async () => {
    expect(await visibleSlugs(adminClient)).toEqual([s("draft"), s("draft-dated"), s("published"), s("scheduled")].sort());
    const ins = await adminClient.from("blog_posts").insert({ slug: s("by-admin"), title: "Oleh admin", content_md: "isi", status: "draf", author_id: ids.admin }).select("id").single();
    expect(ins.error).toBeNull();
    expect((await adminClient.from("blog_posts").update({ title: "Diubah admin" }).eq("id", ins.data!.id).select("title").single()).data?.title).toBe("Diubah admin");
    expect((await adminClient.from("blog_posts").delete().eq("id", ins.data!.id).select("id")).data).toHaveLength(1);
  });

  it("scheduling: a post whose time has not come is hidden, and it appears by itself when published_at passes (no cron)", async () => {
    const at = new Date(Date.now() + 4000).toISOString();
    const ins = await db.from("blog_posts").insert({ slug: s("soon"), title: "Segera", content_md: "isi", status: "terbit", published_at: at, author_id: ids.admin });
    expect(ins.error).toBeNull();
    expect(await visibleSlugs(anon)).not.toContain(s("soon"));
    await new Promise((r) => setTimeout(r, 4500));
    expect(await visibleSlugs(anon)).toContain(s("soon"));
    // pulling it back to a draft hides it again
    await db.from("blog_posts").update({ status: "draf" }).eq("slug", s("soon"));
    expect(await visibleSlugs(anon)).not.toContain(s("soon"));
  }, 60_000);

  it("slugs: unique, lower-case url-safe only; a published post needs a date", async () => {
    const dup = await db.from("blog_posts").insert({ slug: s("published"), title: "Kembar", content_md: "x", status: "draf" });
    expect(dup.error?.code).toBe("23505");
    for (const bad of ["Huruf-Besar", "dengan spasi", "-awal", "akhir-", "dua--strip", "../etc", "a".repeat(101)]) {
      const r = await db.from("blog_posts").insert({ slug: bad, title: "x", content_md: "x", status: "draf" });
      expect(r.error?.code, bad).toBe("23514");
    }
    const noDate = await db.from("blog_posts").insert({ slug: s("nodate"), title: "x", content_md: "x", status: "terbit" });
    expect(noDate.error?.code).toBe("23514");
  });

  it("the blog-images bucket is public read, 2 MB, png / jpeg / webp only; only admins write", async () => {
    const b = (await db.storage.getBucket("blog-images")).data!;
    expect(b).toMatchObject({ public: true, file_size_limit: 2097152 });
    expect([...(b.allowed_mime_types ?? [])].sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
    const name = `zt-${run}-a.png`;
    // anon and a normal user cannot upload
    for (const c of [anon, userClient]) {
      const r = await c.storage.from("blog-images").upload(`zt-${run}-nope.png`, PNG, { contentType: "image/png" });
      expect(r.error).not.toBeNull();
    }
    // an admin can; the file is readable without any login
    const up = await adminClient.storage.from("blog-images").upload(name, PNG, { contentType: "image/png" });
    expect(up.error).toBeNull();
    const publicUrl = anon.storage.from("blog-images").getPublicUrl(name).data.publicUrl;
    expect((await fetch(publicUrl)).status).toBe(200);
    // the bucket refuses other types (svg / html / gif)
    for (const [ext, type] of [["svg", "image/svg+xml"], ["html", "text/html"], ["gif", "image/gif"]] as const) {
      const r = await adminClient.storage.from("blog-images").upload(`zt-${run}-bad.${ext}`, new Blob(["<svg onload=alert(1)>"], { type }), { contentType: type });
      expect(r.error, ext).not.toBeNull();
    }
    // nobody but an admin can delete or replace it
    const del = await anon.storage.from("blog-images").remove([name]);
    expect(del.data ?? []).toHaveLength(0);
    expect((await userClient.storage.from("blog-images").upload(name, PNG, { contentType: "image/png", upsert: true })).error).not.toBeNull();
    expect((await adminClient.storage.from("blog-images").remove([name])).data).toHaveLength(1);
  }, 90_000);
});
