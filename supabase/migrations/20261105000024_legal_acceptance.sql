-- Which version of the legal texts (Syarat & Ketentuan, Kebijakan Refund, Kebijakan Privasi) a user accepted at signup, and when.
-- Nullable: existing users stay null (nothing is backfilled), and so do OAuth signups until they get their own consent step.
-- Written only by server code (service role) in the signup action: users cannot update these columns (column grants stay language + avatar_url).
alter table public.profiles
  add column terms_version text,
  add column terms_accepted_at timestamptz;
