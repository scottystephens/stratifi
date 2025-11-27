# Data Ingestion Architecture - Stratiri

## Overview
Multi-source data ingestion system for bank statements, transactions, and balance data from BAI2 files, APIs (Plaid, Stripe, bank APIs), and SFTP servers.

---

## 1. Database Architecture Decisions

### Option A: Single Schema with tenant_id (RECOMMENDED for Phase 1)
**Pros:**
- ✅ Simpler RLS policies (already implemented)
- ✅ Easier cross-tenant analytics for platform team
- ✅ Lower operational complexity
- ✅ Better for smaller/medium datasets per tenant
- ✅ Cost-effective (single connection pool)

**Cons:**
- ⚠️ All tenants in same tables (mitigated by RLS)
- ⚠️ Potential performance issues at massive scale (10M+ rows)
- ⚠️ Schema changes affect all tenants

### Option B: Separate Schemas per Tenant
**Pros:**
- ✅ Hard isolation (better security posture)
- ✅ Independent schema evolution per tenant
- ✅ Can backup/restore individual tenants
- ✅ Better for enterprise clients with compliance needs

**Cons:**
- ❌ Complex migrations (run on all schemas)
- ❌ Can't query across tenants easily
- ❌ More connection pools needed
- ❌ Higher operational complexity

### Option C: Hybrid Approach
- Core tables in shared schema (accounts, entities, transactions)
- Raw ingestion data in tenant schemas (raw_bai_files, raw_api_responses)
- Best of both worlds, more complexity

### **RECOMMENDATION: Start with Option A**
- Use single schema with `tenant_id` + RLS
- Add `source_system` and `connection_id` columns to track data origin
- Can migrate to separate schemas later if needed (enterprise tier)

---

## 2. Data Ingestion Tables Structure

### Connections Management
```sql
-- Tracks configured data sources
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Connection metadata
  name VARCHAR(255) NOT NULL, -- e.g., "Chase Business Checking"
  connection_type VARCHAR(50) NOT NULL, -- 'bai2', 'plaid', 'stripe', 'sftp', 'api'
  status VARCHAR(50) NOT NULL, -- 'active', 'inactive', 'error', 'pending_setup'
  
  -- Configuration (encrypted in production)
  config JSONB NOT NULL, -- connection-specific settings
  credentials JSONB, -- encrypted credentials (use Vault in prod)
  
  -- Sync settings
  sync_frequency VARCHAR(50), -- 'daily', 'hourly', 'realtime', 'manual'
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  
  -- Metadata
  external_account_id VARCHAR(255), -- Bank account number, Plaid account_id, etc.
  account_id UUID REFERENCES accounts(id), -- Link to internal account
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tracks each sync/ingestion job
CREATE TABLE ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  
  -- Job details
  status VARCHAR(50) NOT NULL, -- 'pending', 'running', 'completed', 'failed', 'partial'
  job_type VARCHAR(50) NOT NULL, -- 'scheduled', 'manual', 'realtime'
  
  -- Metrics
  records_fetched INT DEFAULT 0,
  records_processed INT DEFAULT 0,
  records_imported INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  
  -- Results
  error_message TEXT,
  error_details JSONB,
  summary JSONB, -- stats, warnings, etc.
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw data storage (pre-transformation)
CREATE TABLE raw_ingestion_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
  
  -- Raw data
  raw_data JSONB NOT NULL, -- original response/file content
  file_name VARCHAR(500), -- for file-based imports
  file_size_bytes BIGINT,
  
  -- Processing
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  processing_errors JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mapping external accounts to internal accounts
CREATE TABLE account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  
  -- Mapping
  external_account_id VARCHAR(255) NOT NULL, -- from bank/API
  account_id UUID NOT NULL REFERENCES accounts(id), -- internal account
  
  -- Metadata from external system
  external_metadata JSONB, -- bank name, account type, etc.
  
  -- Status
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, connection_id, external_account_id)
);

-- Audit log for all ingestion activity
CREATE TABLE ingestion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
  job_id UUID REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  
  -- Event
  event_type VARCHAR(100) NOT NULL, -- 'connection_created', 'sync_started', 'data_imported', etc.
  event_data JSONB,
  
  -- User
  user_id UUID REFERENCES auth.users(id),
  ip_address INET,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Enhanced Transactions Table
```sql
-- Add columns to existing transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES connections(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_transaction_id VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS raw_data JSONB; -- original transaction data
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_job_id UUID REFERENCES ingestion_jobs(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

-- Index for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_id 
  ON transactions(tenant_id, connection_id, external_transaction_id) 
  WHERE external_transaction_id IS NOT NULL;
```

---

## 3. Connection Types & Configurations

### BAI2 (Bank Administration Institute v2)
```typescript
interface BAI2Config {
  delivery_method: 'sftp' | 'email' | 'api' | 'manual_upload';
  sftp?: {
    host: string;
    port: number;
    username: string;
    password: string; // encrypted
    path: string;
    file_pattern: string; // e.g., "*.bai"
  };
  processing: {
    auto_import: boolean;
    auto_reconcile: boolean;
    default_currency: string;
  };
}
```

### Plaid API
```typescript
interface PlaidConfig {
  access_token: string; // encrypted
  item_id: string;
  institution_id: string;
  institution_name: string;
  accounts: Array<{
    account_id: string;
    name: string;
    mask: string;
    type: string;
    subtype: string;
  }>;
  sync_type: 'transactions' | 'balance' | 'both';
  lookback_days: number; // how far back to sync
}
```

### Direct Bank API
```typescript
interface BankAPIConfig {
  bank_name: string;
  api_endpoint: string;
  auth_type: 'oauth2' | 'api_key' | 'certificate';
  credentials: {
    client_id?: string;
    client_secret?: string;
    api_key?: string;
    certificate?: string;
  };
  account_identifiers: string[]; // account numbers or IDs
}
```

### SFTP (Generic)
```typescript
interface SFTPConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  private_key?: string;
  path: string;
  file_pattern: string;
  file_type: 'bai2' | 'csv' | 'json' | 'xml' | 'custom';
  csv_config?: {
    delimiter: string;
    header_row: boolean;
    column_mapping: Record<string, string>;
  };
  archive_processed: boolean;
  archive_path?: string;
}
```

---

## 4. Data Flow Architecture

```
┌─────────────────┐
│  External       │
│  Sources        │
│  (Bank/API)     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Ingestion Service                  │
│  - SFTP/API connectors              │
│  - Scheduled jobs (cron/queue)      │
│  - File parsers (BAI2, CSV, etc)    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Raw Data Storage                   │
│  - raw_ingestion_data table         │
│  - Original format preserved        │
│  - Audit trail                      │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Transformation Layer               │
│  - Parse BAI2/CSV/JSON              │
│  - Validate data quality            │
│  - Normalize formats                │
│  - Enrich with metadata             │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Mapping & Reconciliation           │
│  - Match external → internal accts  │
│  - Deduplicate transactions         │
│  - Apply business rules             │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Core Tables                        │
│  - transactions                     │
│  - accounts (balances updated)      │
│  - payments (if applicable)         │
└─────────────────────────────────────┘
```

---

## 5. Key Implementation Questions

### Security & Compliance
1. **Credential Storage**: Use Supabase Vault or external secret manager (AWS Secrets Manager, HashiCorp Vault)?
2. **Encryption**: Encrypt sensitive fields at rest (credentials, account numbers)?
3. **Access Control**: Who can create/modify connections? (admin role only?)
4. **Audit Requirements**: SOC2/PCI compliance needs?
5. **Data Retention**: How long to keep raw ingestion data?

### Data Processing
1. **Deduplication**: How to identify duplicate transactions? (external_id + date + amount?)
2. **Reconciliation**: Auto-match or require manual review?
3. **Conflicts**: What if external data contradicts existing data?
4. **Currency Conversion**: Handle multi-currency accounts?
5. **Time Zones**: Normalize all timestamps to UTC?

### Connection Management
1. **Setup Flow**: Wizard-based UI or manual config?
2. **Validation**: Test connection before saving?
3. **Error Handling**: Retry logic? Alert users on failures?
4. **Monitoring**: Health checks for active connections?

### User Experience
1. **Connection Dashboard**: Show sync status, last sync time, errors
2. **Transaction Review**: Flag imported transactions for review?
3. **Mapping UI**: Allow users to map external accounts → internal accounts
4. **Manual Import**: Support drag-and-drop file uploads?
5. **Notifications**: Email/Slack alerts on sync failures?

### Technical Architecture
1. **Processing Engine**: Next.js API routes vs separate Node service vs queue (BullMQ)?
2. **Scheduling**: Cron jobs (Vercel Cron, GitHub Actions) vs queue-based?
3. **File Storage**: Where to store uploaded BAI2/CSV files? (Supabase Storage, S3?)
4. **Rate Limiting**: API rate limits from banks/Plaid?
5. **Error Recovery**: Partial import recovery? Resume failed jobs?

---

## 6. Recommended Phase 1 MVP

### Scope
1. **Manual File Upload** (BAI2 + CSV)
   - Drag-and-drop upload
   - Parse and transform
   - Map to accounts
   - Review before import

2. **Connection Management UI**
   - View active connections
   - See last sync status
   - Manually trigger sync

3. **Basic Reconciliation**
   - Auto-match by external_transaction_id
   - Flag duplicates for review
   - Allow manual mapping

### Not in Phase 1
- ❌ Automated SFTP/API polling (manual only)
- ❌ Real-time sync (daily batch only)
- ❌ Advanced reconciliation rules
- ❌ Multi-currency support (USD only)

---

## 7. Next Steps

### Immediate Decisions Needed
1. ✅ Use single schema with tenant_id (already decided above)
2. ⚠️ Choose credential storage approach
3. ⚠️ Define connection setup workflow (wizard vs config)
4. ⚠️ Decide on file storage location (Supabase Storage?)

### Implementation Order
1. **Week 1-2**: Database schema + migrations
2. **Week 2-3**: Manual file upload (BAI2 parser)
3. **Week 3-4**: Connection management UI
4. **Week 4-5**: Account mapping + reconciliation
5. **Week 5-6**: CSV/JSON parsers + testing

### Key Files to Create
- `/lib/parsers/bai2-parser.ts` - BAI2 file format parser
- `/lib/parsers/csv-parser.ts` - CSV transaction parser
- `/lib/ingestion/connection-manager.ts` - Manage connections
- `/lib/ingestion/job-processor.ts` - Process ingestion jobs
- `/app/connections/*` - Connection management UI
- `/app/api/upload/*` - File upload endpoints

---

## 8. Example: BAI2 File Flow

```typescript
// User uploads BAI2 file
POST /api/upload/bai2
  ↓
// Store raw file
INSERT INTO raw_ingestion_data { raw_data: <file content> }
  ↓
// Parse BAI2 format
const parsed = parseBAI2(rawData)
// Result: { accounts: [...], transactions: [...], balances: [...] }
  ↓
// Match to internal accounts (or prompt user to map)
const accountMapping = await matchAccounts(parsed.accounts)
  ↓
// Transform to standard format
const transactions = transformTransactions(parsed.transactions)
  ↓
// Deduplicate against existing transactions
const newTransactions = deduplicateTransactions(transactions)
  ↓
// Import to transactions table
await importTransactions(newTransactions)
  ↓
// Update job status
UPDATE ingestion_jobs SET status = 'completed', records_imported = N
```

---

## Resources
- BAI2 Format Spec: https://www.bai.org/libraries/default-document-library/bai_file_format_specification.pdf
- Plaid API: https://plaid.com/docs/
- Treasury Management Best Practices: [internal doc link]

