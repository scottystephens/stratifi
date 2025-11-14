// Migration script to import CSV data into PostgreSQL database
// Run this once after setting up your database

import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false
})

interface CSVRow {
  [key: string]: any
}

async function parseCSV(filePath: string): Promise<CSVRow[]> {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(process.cwd(), filePath)
    const fileContent = fs.readFileSync(fullPath, 'utf-8')
    
    Papa.parse(fileContent, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data as CSVRow[])
      },
      error: (error: Error) => {
        reject(error)
      }
    })
  })
}

async function migrateEntities() {
  console.log('Migrating entities...')
  const entities = await parseCSV('data/entities.csv')
  
  for (const entity of entities) {
    try {
      await pool.query(
        `INSERT INTO entities 
         (entity_id, entity_name, legal_name, country, tax_id, entity_type, parent_entity, status, incorporation_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (entity_id) DO NOTHING`,
        [
          entity.entityId,
          entity.entityName,
          entity.legalName,
          entity.country,
          entity.taxId,
          entity.entityType,
          entity.parentEntity || null,
          entity.status,
          entity.incorporationDate
        ]
      )
      console.log(`✓ Migrated entity: ${entity.entityId}`)
    } catch (error) {
      console.error(`✗ Failed to migrate entity ${entity.entityId}:`, error)
    }
  }
}

async function migrateAccounts() {
  console.log('Migrating accounts...')
  const accounts = await parseCSV('data/accounts.csv')
  
  for (const account of accounts) {
    try {
      await pool.query(
        `INSERT INTO accounts 
         (account_id, account_name, account_number, currency, balance, entity_id, bank_name, account_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (account_id) DO NOTHING`,
        [
          account.accountId,
          account.accountName,
          account.accountNumber,
          account.currency,
          account.balance,
          account.entityId,
          account.bankName,
          account.accountType,
          account.status
        ]
      )
      console.log(`✓ Migrated account: ${account.accountId}`)
    } catch (error) {
      console.error(`✗ Failed to migrate account ${account.accountId}:`, error)
    }
  }
}

async function migrateTransactions() {
  console.log('Migrating transactions...')
  const transactions = await parseCSV('data/transactions.csv')
  
  for (const txn of transactions) {
    try {
      await pool.query(
        `INSERT INTO transactions 
         (transaction_id, account_id, date, description, amount, currency, type, category, status, reference)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (transaction_id) DO NOTHING`,
        [
          txn.transactionId,
          txn.accountId,
          txn.date,
          txn.description,
          txn.amount,
          txn.currency,
          txn.type,
          txn.category,
          txn.status,
          txn.reference
        ]
      )
      console.log(`✓ Migrated transaction: ${txn.transactionId}`)
    } catch (error) {
      console.error(`✗ Failed to migrate transaction ${txn.transactionId}:`, error)
    }
  }
}

async function migratePayments() {
  console.log('Migrating payments...')
  const payments = await parseCSV('data/payments.csv')
  
  for (const payment of payments) {
    try {
      await pool.query(
        `INSERT INTO payments 
         (payment_id, from_account, to_entity, amount, currency, scheduled_date, status, approver, description, payment_type, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (payment_id) DO NOTHING`,
        [
          payment.paymentId,
          payment.fromAccount,
          payment.toEntity,
          payment.amount,
          payment.currency,
          payment.scheduledDate,
          payment.status,
          payment.approver,
          payment.description,
          payment.paymentType,
          payment.priority
        ]
      )
      console.log(`✓ Migrated payment: ${payment.paymentId}`)
    } catch (error) {
      console.error(`✗ Failed to migrate payment ${payment.paymentId}:`, error)
    }
  }
}

async function migrateForecasts() {
  console.log('Migrating forecasts...')
  const forecasts = await parseCSV('data/forecast.csv')
  
  for (const forecast of forecasts) {
    try {
      await pool.query(
        `INSERT INTO forecasts 
         (forecast_id, date, predicted_balance, actual_balance, variance, confidence, entity_id, currency, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (forecast_id) DO NOTHING`,
        [
          forecast.forecastId,
          forecast.date,
          forecast.predictedBalance,
          forecast.actualBalance || null,
          forecast.variance,
          forecast.confidence,
          forecast.entityId,
          forecast.currency,
          forecast.category
        ]
      )
      console.log(`✓ Migrated forecast: ${forecast.forecastId}`)
    } catch (error) {
      console.error(`✗ Failed to migrate forecast ${forecast.forecastId}:`, error)
    }
  }
}

async function main() {
  console.log('🚀 Starting CSV to Database migration...\n')
  
  // Check database connection
  try {
    await pool.query('SELECT 1')
    console.log('✓ Database connection successful\n')
  } catch (error) {
    console.error('✗ Database connection failed:', error)
    process.exit(1)
  }

  try {
    // Migrate in correct order (respecting foreign keys)
    await migrateEntities()
    console.log('')
    
    await migrateAccounts()
    console.log('')
    
    await migrateTransactions()
    console.log('')
    
    await migratePayments()
    console.log('')
    
    await migrateForecasts()
    console.log('')
    
    console.log('✅ Migration completed successfully!')
    
    // Show summary
    const entityCount = await pool.query('SELECT COUNT(*) FROM entities')
    const accountCount = await pool.query('SELECT COUNT(*) FROM accounts')
    const transactionCount = await pool.query('SELECT COUNT(*) FROM transactions')
    const paymentCount = await pool.query('SELECT COUNT(*) FROM payments')
    const forecastCount = await pool.query('SELECT COUNT(*) FROM forecasts')
    
    console.log('\n📊 Summary:')
    console.log(`  - Entities: ${entityCount.rows[0].count}`)
    console.log(`  - Accounts: ${accountCount.rows[0].count}`)
    console.log(`  - Transactions: ${transactionCount.rows[0].count}`)
    console.log(`  - Payments: ${paymentCount.rows[0].count}`)
    console.log(`  - Forecasts: ${forecastCount.rows[0].count}`)
    
  } catch (error) {
    console.error('✗ Migration failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run migration
main()

