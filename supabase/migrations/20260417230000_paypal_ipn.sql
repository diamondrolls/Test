create table if not exists public.user_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nft_cards integer not null default 0 check (nft_cards >= 0),
  bullets integer not null default 100 check (bullets >= 0 and bullets <= 500),
  mint_fee_credits integer not null default 0 check (mint_fee_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.paypal_transactions (
  id bigint generated always as identity primary key,
  txn_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_type text not null check (purchase_type in ('nft_cards', 'mint_fee')),
  quantity integer not null default 1 check (quantity > 0),
  gross numeric(10,2) not null,
  currency text not null,
  status text not null,
  created_at timestamptz not null default now()
);

alter table public.user_balances enable row level security;
alter table public.paypal_transactions enable row level security;

drop policy if exists "Users can read own balances" on public.user_balances;
create policy "Users can read own balances"
  on public.user_balances
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.apply_paypal_credit(
  p_user_id uuid,
  p_purchase_type text,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_purchase_type not in ('nft_cards', 'mint_fee') then
    raise exception 'unsupported purchase type: %', p_purchase_type;
  end if;

  if p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  insert into public.user_balances (user_id, nft_cards, mint_fee_credits)
  values (
    p_user_id,
    case when p_purchase_type = 'nft_cards' then p_quantity else 0 end,
    case when p_purchase_type = 'mint_fee' then p_quantity else 0 end
  )
  on conflict (user_id) do update
    set nft_cards = public.user_balances.nft_cards + excluded.nft_cards,
        mint_fee_credits = public.user_balances.mint_fee_credits + excluded.mint_fee_credits,
        updated_at = now();
end;
$$;

revoke all on function public.apply_paypal_credit(uuid, text, integer) from public;
revoke all on function public.apply_paypal_credit(uuid, text, integer) from anon;
revoke all on function public.apply_paypal_credit(uuid, text, integer) from authenticated;
grant execute on function public.apply_paypal_credit(uuid, text, integer) to service_role;

create or replace function public.process_paypal_transaction(
  p_txn_id text,
  p_user_id uuid,
  p_purchase_type text,
  p_quantity integer,
  p_gross numeric,
  p_currency text,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_status text;
begin
  select status into v_existing_status
  from public.paypal_transactions
  where txn_id = p_txn_id
  for update;

  if found then
    if lower(coalesce(v_existing_status, '')) = 'completed' then
      return false;
    end if;

    update public.paypal_transactions
    set user_id = p_user_id,
        purchase_type = p_purchase_type,
        quantity = p_quantity,
        gross = p_gross,
        currency = p_currency,
        status = p_status
    where txn_id = p_txn_id;

    if lower(coalesce(p_status, '')) = 'completed' then
      perform public.apply_paypal_credit(p_user_id, p_purchase_type, p_quantity);
      return true;
    end if;

    return false;
  end if;

  insert into public.paypal_transactions (txn_id, user_id, purchase_type, quantity, gross, currency, status)
  values (p_txn_id, p_user_id, p_purchase_type, p_quantity, p_gross, p_currency, p_status);

  if lower(coalesce(p_status, '')) = 'completed' then
    perform public.apply_paypal_credit(p_user_id, p_purchase_type, p_quantity);
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.process_paypal_transaction(text, uuid, text, integer, numeric, text, text) from public;
revoke all on function public.process_paypal_transaction(text, uuid, text, integer, numeric, text, text) from anon;
revoke all on function public.process_paypal_transaction(text, uuid, text, integer, numeric, text, text) from authenticated;
grant execute on function public.process_paypal_transaction(text, uuid, text, integer, numeric, text, text) to service_role;
