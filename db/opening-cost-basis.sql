-- Schema-only migration. No backfill, holdings writes, RLS changes or unique index.
ALTER TABLE public.portfolio_transactions
  ADD COLUMN opening_cost_basis numeric;
ALTER TABLE public.portfolio_transactions
  ADD CONSTRAINT portfolio_transactions_opening_cost_basis_check CHECK (
    opening_cost_basis IS NULL OR (
      transaction_type = 'opening'
      AND opening_cost_basis >= 0
      AND opening_cost_basis < 'Infinity'::numeric
    )
  );
COMMENT ON COLUMN public.portfolio_transactions.opening_cost_basis IS
  'Authoritative opening cost in transaction currency; NULL uses legacy quantity * price. Average price is derived. No automatic backfill.';
