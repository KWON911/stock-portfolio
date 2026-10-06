-- Schema patch only. Never rewrites holdings or transaction history.
-- KR ignores exchange; legacy US NULL exchange means NASDAQ in the app.
-- Apply only after inspecting schema and obtaining zero duplicate groups.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
lock table public.portfolio_holdings in share mode;

do $$
begin
  if exists (select 1 from public.portfolio_holdings where market not in ('KR', 'US')) then
    raise exception 'Unsupported holding market; aborting index creation';
  end if;
  if exists (
    select 1 from public.portfolio_holdings
    group by user_id, category, market,
      case when market = 'US' then coalesce(exchange, 'NASDAQ') else null end, symbol
    having count(*) > 1
  ) then
    raise exception 'Duplicate holding identities exist; aborting index creation';
  end if;
  -- Do not silently accept an existing index with an unknown definition.
  if to_regclass('public.portfolio_holdings_unique_domestic') is not null
    or to_regclass('public.portfolio_holdings_unique_us') is not null then
    raise exception 'Identity index name already exists; inspect before applying';
  end if;
end $$;

create unique index portfolio_holdings_unique_domestic
  on public.portfolio_holdings (user_id, category, market, symbol)
  where market = 'KR';

create unique index portfolio_holdings_unique_us
  on public.portfolio_holdings (user_id, category, market, (coalesce(exchange, 'NASDAQ')), symbol)
  where market = 'US';

commit;
