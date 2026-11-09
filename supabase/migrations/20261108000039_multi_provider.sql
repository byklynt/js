-- Multi-provider support (DEV first). The providers table already carries slug, api_url, encrypted key, currency, exchange_rate and active;
-- this only adds which adapter speaks to the provider. Existing rows (Likeo) get 'smm-v2', so nothing changes for them.
alter table public.providers
  add column if not exists adapter_type text not null default 'smm-v2' check (adapter_type in ('smm-v2'));

comment on column public.providers.adapter_type is 'Which API dialect the provider speaks. smm-v2 = standard SMM panel API v2 (key + action).';
