
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  const migrationFile = 'scripts/migrations/33-fix-plaid-relationship.sql';
  const filePath = path.join(process.cwd(), migrationFile);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Migration file not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`📖 Reading migration file: ${migrationFile}`);
  const sql = fs.readFileSync(filePath, 'utf8');

  console.log('🚀 Executing SQL via exec_sql RPC...');
  
  // Call the exec_sql function
  const { data, error } = await supabase.rpc('exec_sql', { sql });

  if (error) {
    console.error('❌ Error executing migration:', error);
    process.exit(1);
  }

  console.log('✅ Migration executed successfully!');
  console.log('Result:', data);
}

runMigration();

