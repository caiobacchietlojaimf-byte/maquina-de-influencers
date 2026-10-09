-- Run against a disposable Postgres database after the commerce migrations.
-- Every fixture is rolled back. No payment provider is contacted.
begin;
do $$
declare
  user_id uuid := gen_random_uuid();
  plan_id uuid := gen_random_uuid();
  plan_ref uuid := gen_random_uuid();
  credit_id uuid := gen_random_uuid();
  credit_ref uuid := gen_random_uuid();
  refund_id uuid := gen_random_uuid();
  refund_ref uuid := gen_random_uuid();
  invalid_id uuid := gen_random_uuid();
  invalid_ref uuid := gen_random_uuid();
  u jsonb;
  plan_before jsonb;
  result jsonb;
begin
  insert into public.mi_users(id,email,created_at,data) values(user_id,user_id::text || '@fixture.invalid',1,jsonb_build_object('id',user_id,'credits',0));
  insert into public.mi_orders(id,user_id,reference_id,status,created_at,data) values(plan_id,user_id,plan_ref,'pending',1,jsonb_build_object('id',plan_id,'userId',user_id,'planId','max','amountCents',9700,'credits',1500));
  perform public.mi_settle_order(plan_ref,'paid',9700,1000);
  select data into u from public.mi_users where id=user_id;
  if (u->>'credits')::integer <> 1500 or u->'planGrants'->(plan_id::text)->>'planId' <> 'max' then raise exception 'Legacy plan settlement failed'; end if;
  plan_before := u->'planGrants';

  insert into public.mi_orders(id,user_id,reference_id,status,created_at,data) values(credit_id,user_id,credit_ref,'pending',2,jsonb_build_object('id',credit_id,'userId',user_id,'kind','credits','packId','credits-100','credits',100,'usdAmountCents',1000,'usdBrlRate',5.1256,'exchangeRateDate','2026-10-09','amountCents',5126));
  perform public.mi_settle_order(credit_ref,'paid',5126,2000);
  perform public.mi_settle_order(credit_ref,'paid',5126,3000);
  perform public.mi_settle_order(credit_ref,'pending',5126,4000);
  perform public.mi_settle_order(credit_ref,'failed',5126,5000);
  select data into u from public.mi_users where id=user_id;
  if (u->>'credits')::integer <> 1600 or u->'planGrants' is distinct from plan_before then raise exception 'Top-up changed plan or granted twice'; end if;
  if (u->'creditPurchases'->(credit_id::text)->>'credits')::integer <> 100 then raise exception 'Missing purchase ledger'; end if;
  if (select status from public.mi_orders where id=credit_id) <> 'paid' then raise exception 'Paid order regressed'; end if;

  update public.mi_users set data=jsonb_set(data,'{credits}','10'::jsonb) where id=user_id;
  perform public.mi_settle_order(credit_ref,'refunded',5126,6000);
  perform public.mi_settle_order(credit_ref,'refunded',5126,7000);
  perform public.mi_settle_order(credit_ref,'paid',5126,8000);
  select data into u from public.mi_users where id=user_id;
  if (u->>'credits')::integer <> -90 or u->'planGrants' is distinct from plan_before then raise exception 'Refund erased debt or changed plan'; end if;
  if u->'creditPurchases'->(credit_id::text)->>'revoked' <> 'true' then raise exception 'Refund was not recorded'; end if;

  insert into public.mi_orders(id,user_id,reference_id,status,created_at,data) values(refund_id,user_id,refund_ref,'pending',2,jsonb_build_object('id',refund_id,'userId',user_id,'kind','credits','packId','credits-50','credits',50,'usdAmountCents',500,'usdBrlRate',5,'exchangeRateDate','2026-10-09','amountCents',2500));
  perform public.mi_settle_order(refund_ref,'refunded',2500,9000);
  perform public.mi_settle_order(refund_ref,'paid',2500,10000);
  select data into u from public.mi_users where id=user_id;
  if (u->>'credits')::integer <> -90 then raise exception 'Payment resurrected a pre-refunded top-up'; end if;

  begin
    perform public.mi_settle_order(credit_ref,'paid',1,10000);
    raise exception 'Expected amount validation';
  exception when others then
    if sqlerrm <> 'Payment amount mismatch' then raise; end if;
  end;
  insert into public.mi_orders(id,user_id,reference_id,status,created_at,data) values(invalid_id,user_id,invalid_ref,'pending',2,jsonb_build_object('id',invalid_id,'userId',user_id,'kind','credits','packId','credits-100','credits',101,'usdAmountCents',1000,'usdBrlRate',5,'exchangeRateDate','2026-10-09','amountCents',5000));
  begin
    perform public.mi_settle_order(invalid_ref,'paid',5000,10000);
    raise exception 'Expected quote validation';
  exception when others then
    if sqlerrm <> 'Credit quote mismatch' then raise; end if;
  end;
  if (select status from public.mi_orders where id=invalid_id) <> 'pending' then raise exception 'Invalid order was mutated'; end if;
  if has_function_privilege('anon','public.mi_settle_order(uuid,text,integer,bigint)','EXECUTE') or has_function_privilege('authenticated','public.mi_settle_order(uuid,text,integer,bigint)','EXECUTE') then raise exception 'Settlement is exposed to browser roles'; end if;
  if not has_function_privilege('service_role','public.mi_settle_order(uuid,text,integer,bigint)','EXECUTE') then raise exception 'Server cannot settle payments'; end if;
  if (select prosecdef from pg_proc where oid='public.mi_settle_order(uuid,text,integer,bigint)'::regprocedure) then raise exception 'Settlement escalates privileges'; end if;
  if public.mi_credit_topups_ready() is distinct from true then raise exception 'Missing checkout capability'; end if;
  if has_function_privilege('anon','public.mi_credit_topups_ready()','EXECUTE') or has_function_privilege('authenticated','public.mi_credit_topups_ready()','EXECUTE') then raise exception 'Capability is exposed to browser roles'; end if;
end $$;
rollback;
