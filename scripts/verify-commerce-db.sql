-- Transactional integration checks. All fixture data is rolled back.
begin;
do $$
declare uid uuid := gen_random_uuid(); oid uuid := gen_random_uuid(); ref uuid := gen_random_uuid(); now_ms bigint := floor(extract(epoch from clock_timestamp())*1000); balance integer;
begin
  if has_table_privilege('anon','public.mi_orders','SELECT') or has_table_privilege('authenticated','public.mi_orders','INSERT') then raise exception 'Commerce publicly accessible'; end if;
  if has_function_privilege('anon','public.mi_settle_order(uuid,text,integer,bigint)','EXECUTE') then raise exception 'Settlement publicly callable'; end if;
  insert into public.mi_users(id,email,created_at,data) values(uid,uid::text||'@integration.invalid',now_ms,jsonb_build_object('id',uid,'email',uid::text||'@integration.invalid','name','Integration test','passwordHash','disabled','salt','disabled','credits',0,'createdAt',now_ms));
  insert into public.mi_orders(id,user_id,reference_id,status,created_at,data) values(oid,uid,ref,'pending',now_ms,jsonb_build_object('id',oid,'userId',uid,'planId','starter','amountCents',9700,'credits',1500,'status','pending','referenceId',ref,'createdAt',now_ms));
  perform public.mi_settle_order(ref,'paid',9700,now_ms);
  perform public.mi_settle_order(ref,'paid',9700,now_ms+1);
  perform public.mi_settle_order(ref,'pending',9700,now_ms+2);
  select (data->>'credits')::integer into balance from public.mi_users where id=uid;
  if balance <> 1500 then raise exception 'Duplicate payment credits'; end if;
  if (select status from public.mi_orders where id=oid) <> 'paid' then raise exception 'Payment regressed'; end if;
  perform public.mi_settle_order(ref,'refunded',9700,now_ms+3);
  perform public.mi_settle_order(ref,'refunded',9700,now_ms+4);
  perform public.mi_settle_order(ref,'paid',9700,now_ms+5);
  select (data->>'credits')::integer into balance from public.mi_users where id=uid;
  if balance <> 0 then raise exception 'Refund repeated or payment replayed'; end if;
  if (select status from public.mi_orders where id=oid) <> 'refunded' then raise exception 'Refund resurrected'; end if;
  if not public.mi_consume_rate_limit(uid::text,1,now_ms+60000,now_ms) then raise exception 'First limit denied'; end if;
  if public.mi_consume_rate_limit(uid::text,1,now_ms+60000,now_ms) then raise exception 'Limit bypassed'; end if;
end $$;
rollback;
