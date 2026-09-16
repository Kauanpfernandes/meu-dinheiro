-- ============================================================
--  Meu Dinheiro — estrutura do banco
--  Cole TUDO isto no SQL Editor do Supabase e clique em "Run".
--  Pode rodar mais de uma vez sem quebrar nada.
-- ============================================================

-- --------------------------------------------------------
-- 1. Tabela dos lançamentos
-- --------------------------------------------------------
create table if not exists public.lancamentos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
                 references auth.users(id) on delete cascade,

  tipo         text not null check (tipo in ('entrada','saida')),
  descricao    text not null check (char_length(descricao) between 1 and 120),
  valor        numeric(12,2) not null check (valor > 0),
  categoria    text not null default 'Outros',
  data         date not null,

  -- 'unica'      = acontece uma vez, na data
  -- 'fixa'       = repete todo mês a partir da data (até 'fim', se houver)
  -- 'parcelada'  = 'valor' é o total; o app divide por 'parcelas'
  recorrencia  text not null default 'unica'
                 check (recorrencia in ('unica','fixa','parcelada')),
  parcelas     smallint check (parcelas is null or parcelas between 2 and 240),
  fim          text,      -- 'AAAA-MM', só para as fixas
  cartao       boolean not null default false,

  criado_em    timestamptz not null default now()
);

create index if not exists lancamentos_user_data_idx
  on public.lancamentos (user_id, data);

-- --------------------------------------------------------
-- 2. Tabela de configuração (uma linha por pessoa)
-- --------------------------------------------------------
create table if not exists public.config (
  user_id       uuid primary key default auth.uid()
                  references auth.users(id) on delete cascade,
  meta          numeric(12,2) not null default 0,
  saldo_inicial numeric(12,2) not null default 0,
  atualizado_em timestamptz not null default now()
);

-- --------------------------------------------------------
-- 3. Row Level Security — o que faz os dados serem só seus
--    Sem isto, qualquer pessoa com a chave anon leria tudo.
-- --------------------------------------------------------
alter table public.lancamentos enable row level security;
alter table public.config      enable row level security;

drop policy if exists "cada um mexe nos proprios lancamentos" on public.lancamentos;
create policy "cada um mexe nos proprios lancamentos"
  on public.lancamentos
  for all
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "cada um mexe na propria config" on public.config;
create policy "cada um mexe na propria config"
  on public.config
  for all
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
