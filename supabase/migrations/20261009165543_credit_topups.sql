-- New credit purchases have their own idempotency ledger. Existing orders
-- without a kind continue to grant their original plan and credit amount.
create or replace function public.mi_settle_order(p_reference uuid, p_status text, p_amount_cents integer, p_now bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  o public.mi_orders%rowtype;
  u jsonb;
  ledger jsonb;
  prior jsonb;
  until_at bigint;
  grant_credits integer;
  order_kind text;
  ledger_key text;
  usd_cents numeric;
  usd_brl_rate numeric;
begin
  select * into o from public.mi_orders where reference_id=p_reference for update;
  if not found then return null; end if;
  if p_status is null or p_status not in ('paid','refunded','pending','failed') then raise exception 'Invalid status'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or (o.data->>'amountCents')::integer is distinct from p_amount_cents then raise exception 'Payment amount mismatch'; end if;
  if jsonb_typeof(o.data->'credits') is distinct from 'number' or coalesce(o.data->>'credits','') !~ '^[1-9][0-9]*$' then raise exception 'Invalid credits'; end if;
  grant_credits := (o.data->>'credits')::integer;
  order_kind := coalesce(o.data->>'kind','plan');
  if order_kind='credits' then
    if o.data->>'planId' is not null or coalesce(o.data->>'packId','') !~ '^[a-z0-9-]{1,64}$'
      or jsonb_typeof(o.data->'usdAmountCents') is distinct from 'number'
      or jsonb_typeof(o.data->'usdBrlRate') is distinct from 'number'
      or coalesce(o.data->>'exchangeRateDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid credit quote'; end if;
    usd_cents := (o.data->>'usdAmountCents')::numeric;
    usd_brl_rate := (o.data->>'usdBrlRate')::numeric;
    if usd_cents <> grant_credits::numeric * 10 or usd_brl_rate <= 0 or usd_brl_rate > 100
      or round(usd_cents * usd_brl_rate) <> p_amount_cents then raise exception 'Credit quote mismatch'; end if;
    ledger_key := 'creditPurchases';
  elsif order_kind='plan' and coalesce(o.data->>'planId','') in ('starter','pro','max') then
    ledger_key := 'planGrants';
  else
    raise exception 'Invalid order kind or plan';
  end if;
  if o.status='refunded' then return o.data; end if;
  if p_status in ('pending','failed') and o.status='paid' then return o.data; end if;
  if p_status in ('paid','refunded') then
    select data into u from public.mi_users where id=o.user_id for update;
    if not found then raise exception 'User missing'; end if;
    ledger := coalesce(u->ledger_key,'{}'::jsonb);
    prior := ledger->(o.id::text);
    if p_status='paid' and prior is null then
      if order_kind='credits' then
        ledger := ledger || jsonb_build_object(o.id::text,jsonb_build_object('credits',grant_credits,'grantedAt',p_now));
      else
        select greatest(p_now,coalesce(max((value->>'expiresAt')::bigint),p_now)) into until_at
          from jsonb_each(ledger) where value->>'planId'=o.data->>'planId' and coalesce((value->>'revoked')::boolean,false)=false;
        ledger := ledger || jsonb_build_object(o.id::text,jsonb_build_object('planId',o.data->>'planId','credits',grant_credits,'startsAt',p_now,'expiresAt',until_at + 2592000000));
      end if;
      u := jsonb_set(u,'{credits}',to_jsonb((u->>'credits')::integer+grant_credits));
    elsif p_status='refunded' and prior is not null and coalesce((prior->>'revoked')::boolean,false)=false then
      ledger := jsonb_set(ledger,array[o.id::text,'revoked'],'true');
      -- Keep debt if purchased credits were already spent; never silently
      -- forgive it by clamping the balance to zero.
      u := jsonb_set(u,'{credits}',to_jsonb((u->>'credits')::integer-(prior->>'credits')::integer));
    end if;
    u := u || jsonb_build_object(ledger_key,ledger,'creditRevision',gen_random_uuid()::text);
    update public.mi_users set data=u where id=o.user_id;
  end if;
  o.data := o.data || jsonb_build_object('status',p_status,'updatedAt',p_now);
  if p_status='paid' and o.data->>'paidAt' is null then o.data := o.data || jsonb_build_object('paidAt',p_now); end if;
  update public.mi_orders set data=o.data,status=p_status where id=o.id;
  return o.data;
end; $$;
revoke all on function public.mi_settle_order(uuid,text,integer,bigint) from public, anon, authenticated;
grant execute on function public.mi_settle_order(uuid,text,integer,bigint) to service_role;

-- Checkout must confirm this capability before issuing a credit-purchase PIX.
create or replace function public.mi_credit_topups_ready()
returns boolean language sql security invoker set search_path = '' as $$ select true; $$;
revoke all on function public.mi_credit_topups_ready() from public, anon, authenticated;
grant execute on function public.mi_credit_topups_ready() to service_role;
