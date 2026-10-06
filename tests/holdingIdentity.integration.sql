-- Test the ACTUAL installed index definitions on temporary synthetic rows only.
-- Never INSERT/UPDATE/DELETE public.portfolio_holdings or transactions.
begin;
create temporary table holding_identity_probe (
  user_id uuid not null, category text not null, market text not null,
  exchange text, symbol text not null, name text
) on commit drop;

do $$
declare definition text;
begin
  select replace(pg_get_indexdef('public.portfolio_holdings_unique_domestic'::regclass),
    'CREATE UNIQUE INDEX portfolio_holdings_unique_domestic ON public.portfolio_holdings',
    'CREATE UNIQUE INDEX identity_probe_kr ON pg_temp.holding_identity_probe') into definition;
  execute definition;
  select replace(pg_get_indexdef('public.portfolio_holdings_unique_us'::regclass),
    'CREATE UNIQUE INDEX portfolio_holdings_unique_us ON public.portfolio_holdings',
    'CREATE UNIQUE INDEX identity_probe_us ON pg_temp.holding_identity_probe') into definition;
  execute definition;

  insert into pg_temp.holding_identity_probe values
    ('00000000-0000-0000-0000-000000000001','investment','KR',null,'000660','name A');
  begin
    insert into pg_temp.holding_identity_probe values
      ('00000000-0000-0000-0000-000000000001','investment','KR','NYSE','000660','different name');
    raise exception 'KR duplicate/name/exchange identity test failed';
  exception when unique_violation then null;
  end;
  insert into pg_temp.holding_identity_probe values
    ('00000000-0000-0000-0000-000000000001','pension','KR',null,'000660','name B'),
    ('00000000-0000-0000-0000-000000000002','investment','KR',null,'000660','another user'),
    ('00000000-0000-0000-0000-000000000001','investment','US','NASDAQ','AAPL','Apple');
  begin
    insert into pg_temp.holding_identity_probe values
      ('00000000-0000-0000-0000-000000000001','investment','US','NASDAQ','AAPL','other name');
    raise exception 'US duplicate test failed';
  exception when unique_violation then null;
  end;
  insert into pg_temp.holding_identity_probe values
    ('00000000-0000-0000-0000-000000000001','investment','US','NYSE','AAPL','exchange distinction'),
    ('00000000-0000-0000-0000-000000000001','investment','US','AMEX','AAPL','exchange distinction'),
    ('00000000-0000-0000-0000-000000000001','investment','US',null,'VOO','legacy null');
  begin
    insert into pg_temp.holding_identity_probe values
      ('00000000-0000-0000-0000-000000000001','investment','US',null,'AAPL','null means NASDAQ');
    raise exception 'US NULL/NASDAQ equivalence test failed';
  exception when unique_violation then null;
  end;
  begin
    insert into pg_temp.holding_identity_probe values
      ('00000000-0000-0000-0000-000000000001','investment','US',null,'VOO','another null');
    raise exception 'US NULL/NULL duplicate test failed';
  exception when unique_violation then null;
  end;
  if (select count(*) from pg_temp.holding_identity_probe) <> 7 then
    raise exception 'Unexpected synthetic row count';
  end if;
end $$;
select jsonb_build_object('krDuplicateRejected',true,'nameIgnored',true,
  'krExchangeIgnored',true,'differentCategoryAllowed',true,'differentUserAllowed',true,
  'usDuplicateRejected',true,'differentExchangeAllowed',true,'usNullEqualsNasdaq',true,
  'usNullDuplicateRejected',true,'realUserRowsTouched',false) as integration_result;
rollback;
