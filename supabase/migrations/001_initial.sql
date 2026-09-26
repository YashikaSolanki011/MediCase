create table if not exists public.clinical_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text,
  patient_name text,
  patient_age integer,
  language text,
  chief_complaint text,
  intake_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clinical_sessions_owner_updated
  on public.clinical_sessions(owner_user_id, updated_at desc);

create table if not exists public.clinical_documents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.clinical_sessions(id) on delete cascade,
  filename text not null,
  content_type text not null,
  storage_key text,
  ocr_text text,
  extraction_json jsonb not null default '{}'::jsonb,
  verification_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists idx_clinical_documents_session
  on public.clinical_documents(session_id, created_at);

create table if not exists public.clinical_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.clinical_sessions(id) on delete cascade,
  event_type text not null,
  source text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_clinical_events_session
  on public.clinical_events(session_id, created_at);

create table if not exists public.benchmark_patients (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  patient_name text not null,
  age integer not null,
  sex text not null,
  language text not null,
  chief_complaint text not null,
  ground_truth jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.benchmark_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.benchmark_patients(id) on delete cascade,
  external_id text unique not null,
  document_type text not null,
  document_date date not null,
  filename text not null,
  source_text text not null,
  ground_truth jsonb not null default '{}'::jsonb,
  ocr_status text not null default 'not_run',
  created_at timestamptz not null default now()
);

create index if not exists idx_benchmark_documents_patient
  on public.benchmark_documents(patient_id, document_date);

insert into storage.buckets (id,name,public)
values ('clinical-documents','clinical-documents',false)
on conflict (id) do nothing;

alter table public.clinical_sessions enable row level security;
alter table public.clinical_documents enable row level security;
alter table public.clinical_events enable row level security;

drop policy if exists "server_only_sessions" on public.clinical_sessions;
drop policy if exists "server_only_documents" on public.clinical_documents;
drop policy if exists "server_only_events" on public.clinical_events;
