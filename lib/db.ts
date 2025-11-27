// Database connection and query helpers
// Use this file when you're ready to move from CSV to real database

import { Pool } from 'pg'

// Parse DATABASE_URL and extract components
function createPool(databaseUrl: string) {
  const isLocalhost = databaseUrl.includes('localhost')
  const isPgBouncer = databaseUrl.includes('pgbouncer=true') || databaseUrl.includes('6543')
  
  // For pgBouncer/pooler, use connectionString directly
  // For direct connections, parse and configure
  if (isPgBouncer) {
    return new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 10, // Lower max for pooler
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      application_name: 'stratiri',
    })
  }
  
  // Direct connection - parse URL to force IPv4
  const url = new URL(databaseUrl)
  
  return new Pool({
    user: url.username,
    password: url.password,
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1),
    ssl: isLocalhost
      ? false
      : {
          rejectUnauthorized: false,
        },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: 'stratiri',
  })
}

// Only initialize pool if DATABASE_URL is provided
const pool = process.env.DATABASE_URL
  ? createPool(process.env.DATABASE_URL)
  : null

export async function query(text: string, params?: any[]) {
  if (!pool) {
    throw new Error('Database not configured. Set DATABASE_URL environment variable.')
  }
  
  const client = await pool.connect()
  try {
    const result = await client.query(text, params)
    return result.rows
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  } finally {
    client.release()
  }
}

// Account queries
export async function getAccounts() {
  return await query(`
    SELECT * FROM accounts 
    WHERE status = 'Active'
    ORDER BY account_id
  `)
}

export async function getAccountById(accountId: string) {
  const results = await query(
    'SELECT * FROM accounts WHERE account_id = $1',
    [accountId]
  )
  return results[0] || null
}

export async function getAccountsByEntity(entityId: string) {
  return await query(
    'SELECT * FROM accounts WHERE entity_id = $1 ORDER BY account_name',
    [entityId]
  )
}

export async function updateAccountBalance(accountId: string, newBalance: number) {
  return await query(
    'UPDATE accounts SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE account_id = $2 RETURNING *',
    [newBalance, accountId]
  )
}

// Entity queries
export async function getEntities() {
  return await query(`
    SELECT * FROM entities 
    ORDER BY entity_id
  `)
}

export async function getEntityById(entityId: string) {
  const results = await query(
    'SELECT * FROM entities WHERE entity_id = $1',
    [entityId]
  )
  return results[0] || null
}

export async function getActiveEntities() {
  return await query(`
    SELECT * FROM entities 
    WHERE status = 'Active'
    ORDER BY entity_name
  `)
}

// Transaction queries
export async function getTransactions(limit?: number) {
  const limitClause = limit ? `LIMIT ${limit}` : ''
  return await query(`
    SELECT * FROM transactions 
    ORDER BY date DESC, created_at DESC
    ${limitClause}
  `)
}

export async function getTransactionsByAccount(accountId: string, limit?: number) {
  const limitClause = limit ? `LIMIT ${limit}` : ''
  return await query(
    `SELECT * FROM transactions 
     WHERE account_id = $1 
     ORDER BY date DESC 
     ${limitClause}`,
    [accountId]
  )
}

export async function getTransactionsByDateRange(startDate: string, endDate: string) {
  return await query(
    `SELECT * FROM transactions 
     WHERE date BETWEEN $1 AND $2 
     ORDER BY date DESC`,
    [startDate, endDate]
  )
}

export async function createTransaction(transaction: {
  transactionId: string
  accountId: string
  date: string
  description: string
  amount: number
  currency: string
  type: string
  category: string
  status: string
  reference: string
}) {
  return await query(
    `INSERT INTO transactions 
     (transaction_id, account_id, date, description, amount, currency, type, category, status, reference)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      transaction.transactionId,
      transaction.accountId,
      transaction.date,
      transaction.description,
      transaction.amount,
      transaction.currency,
      transaction.type,
      transaction.category,
      transaction.status,
      transaction.reference
    ]
  )
}

// Payment queries
export async function getPayments() {
  return await query(`
    SELECT * FROM payments 
    ORDER BY scheduled_date DESC
  `)
}

export async function getPaymentById(paymentId: string) {
  const results = await query(
    'SELECT * FROM payments WHERE payment_id = $1',
    [paymentId]
  )
  return results[0] || null
}

export async function getPaymentsByStatus(status: string) {
  return await query(
    'SELECT * FROM payments WHERE status = $1 ORDER BY scheduled_date',
    [status]
  )
}

export async function updatePaymentStatus(paymentId: string, status: string) {
  return await query(
    'UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE payment_id = $2 RETURNING *',
    [status, paymentId]
  )
}

export async function createPayment(payment: {
  paymentId: string
  fromAccount: string
  toEntity: string
  amount: number
  currency: string
  scheduledDate: string
  status: string
  approver: string
  description: string
  paymentType: string
  priority: string
}) {
  return await query(
    `INSERT INTO payments 
     (payment_id, from_account, to_entity, amount, currency, scheduled_date, status, approver, description, payment_type, priority)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
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
}

// Forecast queries
export async function getForecasts() {
  return await query(`
    SELECT * FROM forecasts 
    ORDER BY date
  `)
}

export async function getForecastsByEntity(entityId: string) {
  return await query(
    'SELECT * FROM forecasts WHERE entity_id = $1 ORDER BY date',
    [entityId]
  )
}

export async function createForecast(forecast: {
  forecastId: string
  date: string
  predictedBalance: number
  actualBalance: number | null
  variance: number
  confidence: number
  entityId: string
  currency: string
  category: string
}) {
  return await query(
    `INSERT INTO forecasts 
     (forecast_id, date, predicted_balance, actual_balance, variance, confidence, entity_id, currency, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      forecast.forecastId,
      forecast.date,
      forecast.predictedBalance,
      forecast.actualBalance,
      forecast.variance,
      forecast.confidence,
      forecast.entityId,
      forecast.currency,
      forecast.category
    ]
  )
}

// Exchange Rate queries
export async function getExchangeRates(date?: string) {
  if (date) {
    return await query(
      'SELECT * FROM exchange_rates WHERE date = $1 ORDER BY currency_code',
      [date]
    )
  }
  return await query(`
    SELECT * FROM exchange_rates 
    WHERE date = (SELECT MAX(date) FROM exchange_rates)
    ORDER BY currency_code
  `)
}

export async function getLatestExchangeRate(currencyCode: string) {
  const results = await query(
    'SELECT * FROM exchange_rates WHERE currency_code = $1 ORDER BY date DESC LIMIT 1',
    [currencyCode]
  )
  return results[0] || null
}

export async function upsertExchangeRate(data: {
  currencyCode: string
  currencyName: string
  rate: number
  date: string
  source: string
}) {
  return await query(
    `INSERT INTO exchange_rates (currency_code, currency_name, rate, date, source, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (currency_code, date) 
     DO UPDATE SET 
       rate = EXCLUDED.rate,
       currency_name = EXCLUDED.currency_name,
       source = EXCLUDED.source,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [data.currencyCode, data.currencyName, data.rate, data.date, data.source]
  )
}

export async function getExchangeRateHistory(currencyCode: string, days: number = 30) {
  return await query(
    `SELECT * FROM exchange_rates 
     WHERE currency_code = $1 
       AND date >= CURRENT_DATE - INTERVAL '${days} days'
     ORDER BY date DESC`,
    [currencyCode]
  )
}

// Health check
export async function testConnection() {
  try {
    await query('SELECT 1 as test')
    return true
  } catch (error) {
    console.error('Database connection test failed:', error)
    return false
  }
}

