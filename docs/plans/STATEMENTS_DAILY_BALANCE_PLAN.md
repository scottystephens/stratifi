## Statement (Daily Balance) Plan

### 1. Definition & Scope
- **Statement:** End-of-day snapshot of an account’s ledger/available balance. Stored per `account_id`, `tenant_id`, `statement_date`, `currency`, `ending_balance`, `available_balance`, `usd_equivalent`, `source`, `ingested_at`, `confidence`.
- Sources:
  - `synced` – produced automatically during provider syncs (preferred).
  - `calculated` – derived from transactions for accounts without explicit provider balances.
  - `manual` / `imported` – user-uploaded CSV or keyed entry for legacy/unsynced accounts.

### 2. Data Model & API
1. **Table:** `account_statements`
   ```sql
   CREATE TABLE account_statements (
     id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
     tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
     account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
     statement_date date NOT NULL,
     ending_balance numeric(20,4) NOT NULL,
     available_balance numeric(20,4),
     currency text NOT NULL,
     usd_equivalent numeric(20,4),
     source text NOT NULL CHECK (source IN ('synced','calculated','manual','imported')),
     confidence text CHECK (confidence IN ('high','medium','low')) DEFAULT 'high',
     ingested_at timestamptz DEFAULT now(),
     metadata jsonb DEFAULT '{}'::jsonb,
     UNIQUE (account_id, statement_date)
   );
   ```
2. **API Routes**
   - `GET /api/accounts/[id]/statements?page=1&pageSize=60&startDate=...`
   - `POST /api/accounts/[id]/statements` (manual entry/import).
   - `POST /api/accounts/[id]/statements/import` (CSV upload, re-use BulkImportModal).
   - `GET /api/entities/[id]/statements/summary` for roll-up (optional phase 2).

### 3. Sync Integration (Synced Accounts)
1. In `lib/services/sync-service.ts`, after transactions + provider account update:
   - Insert/update statement row for `statement_date = today`.
   - Use provider-reported balance (current_balance) and convert to USD using latest FX rate.
2. If provider supplies historical balances (Tink `account.balances`, Bunq statements):
   - Add optional `provider.fetchStatements?` hook to banking provider base class.
   - Backfill missing days up to 90 days (configurable) when available.

### 4. Unsynced/Manual Accounts
1. Extend `BulkImportModal` with “Statement CSV” option (columns: `account_id`, `date`, `ending_balance`, `currency`).
2. `app/accounts/[id]/page.tsx` gets a “Add Statement” drawer allowing manual entry.
3. When no statement exists for a date range but transactions are complete, optionally compute a synthetic statement using running balance (mark as `calculated` + `confidence=medium`).

### 5. Initial UI (MVP)
1. **Accounts detail page (`app/accounts/[id]/page.tsx`)**
   - Add new “Daily Balance” card containing:
     - Mini sparkline chart (Recharts) of last 30 statements.
     - Latest statement info (date, ending balance, source badge).
     - CTA buttons: `Add Statement` (manual) and `Download CSV`.
   - Insert tabbed section (Transactions | Statements). Statements tab shows paginated table:
     | Date | Ending Balance | Available | Currency | Source | Confidence |
2. **Entities dashboard (`components/EntityGroupedView.tsx`)**
   - Show statement health indicator per account: e.g., “Statements up to Nov 16” or “Missing 5 days”.
3. **Admin > Connections health**
   - Column for “Statements coverage (%)” to watch gaps across tenants.

### 6. Rollout Plan
1. **Phase 0 – Schema & Sync Hook**
   - Create migration for `account_statements`.
   - Update sync service to produce statements for synced accounts.
2. **Phase 1 – API + UI (Accounts Page)**
   - Build statements API, React Query hooks (`useAccountStatements`), and UI (sparkline + table + manual entry modal).
   - Add CSV export and “Load more” pagination (reuse pattern from transactions).
3. **Phase 2 – Manual Import & Health**
   - Extend BulkImportModal with statement import.
   - Add entity-level badges for missing statements.
4. **Phase 3 – Analytics**
   - Use statements for cash forecasting widgets, exposure heatmaps, etc.

### 7. Testing & Monitoring
- Add unit tests for statement insertion (synced + manual).
- Seed sample statements in data-generation scripts.
- Dashboard alerts for accounts missing statements > 3 days (Slack alert or admin panel).

### 8. Dependencies
- Existing FX tables (exchange rates) for USD conversions.
- New background task (optional) to reconcile statements nightly.

