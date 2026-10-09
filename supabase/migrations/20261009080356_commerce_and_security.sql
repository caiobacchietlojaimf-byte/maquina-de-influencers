-- Server-only commerce. Application sessions are validated by Next.js; the
-- browser never receives the database service credential.
create table if not exists public.mi_orders (
  id uuid primary key,
  user_id uuid not null references public.mi_users(id),
  reference_id uuid unique,
  status text not null,
  created_at bigint not null,
  data jsonb not null
);
create index if not exists mi_orders_user_created on public.mi_orders(user_id, created_at desc);
create index if not exists mi_orders_status_created on public.mi_orders(status, created_at desc);
create table if not exists public.mi_settings (id text primary key, data jsonb not null);
create table if not exists public.mi_admin_audit (id uuid primary key default gen_random_uuid(), actor_id uuid not null, action text not null, target_id text, created_at bigint not null, details jsonb not null default '{}');
create index if not exists mi_admin_audit_created on public.mi_admin_audit(created_at desc);
create table if not exists public.mi_rate_limits (id text primary key, count integer not null, expires_at bigint not null);
create index if not exists mi_rate_limits_expiry on public.mi_rate_limits(expires_at);
alter table public.mi_orders enable row level security;
alter table public.mi_settings enable row level security;
alter table public.mi_admin_audit enable row level security;
alter table public.mi_rate_limits enable row level security;
revoke all on public.mi_orders, public.mi_settings, public.mi_admin_audit, public.mi_rate_limits from anon, authenticated;
grant all on public.mi_orders, public.mi_settings, public.mi_admin_audit, public.mi_rate_limits to service_role;

create or replace function public.mi_consume_rate_limit(p_id text, p_limit integer, p_expires bigint, p_now bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if p_limit < 1 or p_limit > 10000 or length(p_id) > 160 then raise exception 'Invalid limit'; end if;
  delete from public.mi_rate_limits where expires_at < p_now;
  insert into public.mi_rate_limits(id,count,expires_at) values(p_id,1,p_expires)
    on conflict(id) do update set count = public.mi_rate_limits.count + 1
    returning count into n;
  return n <= p_limit;
end; $$;
revoke all on function public.mi_consume_rate_limit(text,integer,bigint,bigint) from public, anon, authenticated;
grant execute on function public.mi_consume_rate_limit(text,integer,bigint,bigint) to service_role;

-- Atomic order settlement + credit ledger. Duplicate/reordered notifications
-- cannot grant credits twice or undo a refund.
create or replace function public.mi_settle_order(p_reference uuid, p_status text, p_amount_cents integer, p_now bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.mi_orders%rowtype; u jsonb; grants jsonb; prior jsonb; until_at bigint; grant_credits integer;
begin
  select * into o from public.mi_orders where reference_id=p_reference for update;
  if not found then return null; end if;
  if (o.data->>'amountCents')::integer <> p_amount_cents then raise exception 'Payment amount mismatch'; end if;
  if p_status not in ('paid','refunded','pending','failed') then raise exception 'Invalid status'; end if;
  if o.status='refunded' then return o.data; end if;
  if p_status in ('pending','failed') and o.status='paid' then return o.data; end if;
  select data into u from public.mi_users where id=o.user_id for update;
  if not found then raise exception 'User missing'; end if;
  grants := coalesce(u->'planGrants','{}'::jsonb);
  prior := grants->(o.id::text);
  grant_credits := (o.data->>'credits')::integer;
  if p_status='paid' and prior is null then
    select greatest(p_now,coalesce(max((value->>'expiresAt')::bigint),p_now)) into until_at
      from jsonb_each(grants) where value->>'planId'=o.data->>'planId' and coalesce((value->>'revoked')::boolean,false)=false;
    grants := grants || jsonb_build_object(o.id::text,jsonb_build_object('planId',o.data->>'planId','credits',grant_credits,'startsAt',p_now,'expiresAt',until_at + 2592000000));
    u := jsonb_set(u,'{credits}',to_jsonb((u->>'credits')::integer+grant_credits));
  elsif p_status='refunded' and prior is not null and coalesce((prior->>'revoked')::boolean,false)=false then
    grants := jsonb_set(grants,array[o.id::text,'revoked'],'true');
    u := jsonb_set(u,'{credits}',to_jsonb((u->>'credits')::integer-(prior->>'credits')::integer));
  end if;
  u := u || jsonb_build_object('planGrants',grants,'creditRevision',gen_random_uuid()::text);
  update public.mi_users set data=u where id=o.user_id;
  o.data := o.data || jsonb_build_object('status',p_status,'updatedAt',p_now);
  if p_status='paid' and o.data->>'paidAt' is null then o.data := o.data || jsonb_build_object('paidAt',p_now); end if;
  update public.mi_orders set data=o.data,status=p_status where id=o.id;
  return o.data;
end; $$;
revoke all on function public.mi_settle_order(uuid,text,integer,bigint) from public, anon, authenticated;
grant execute on function public.mi_settle_order(uuid,text,integer,bigint) to service_role;
