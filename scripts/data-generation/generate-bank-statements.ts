#!/usr/bin/env tsx

import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// Generate bank statements for last 2 years
const startDate = new Date('2023-01-01');
const endDate = new Date('2025-01-14');

interface Transaction {
  date: string;
  description: string;
  reference: string;
  debit?: number;
  credit?: number;
  amount: number;
  balance: number;
  currency: string;
  category?: string;
}

// Realistic transaction types
const transactionTypes = {
  income: [
    { desc: 'Salary Deposit', amount: 5000, category: 'Payroll' },
    { desc: 'Freelance Payment', amount: 1500, category: 'Income' },
    { desc: 'Investment Return', amount: 250, category: 'Investment' },
    { desc: 'Refund', amount: 50, category: 'Refund' },
  ],
  expenses: [
    { desc: 'Rent Payment', amount: -1800, category: 'Housing' },
    { desc: 'Electric Bill', amount: -120, category: 'Utilities' },
    { desc: 'Internet Service', amount: -80, category: 'Utilities' },
    { desc: 'Grocery Store', amount: -85, category: 'Food' },
    { desc: 'Coffee Shop', amount: -5.50, category: 'Food' },
    { desc: 'Restaurant', amount: -45, category: 'Dining' },
    { desc: 'Gas Station', amount: -60, category: 'Transportation' },
    { desc: 'Insurance Premium', amount: -150, category: 'Insurance' },
    { desc: 'Software Subscription', amount: -29.99, category: 'Technology' },
    { desc: 'Mobile Phone', amount: -75, category: 'Utilities' },
    { desc: 'Gym Membership', amount: -50, category: 'Health' },
    { desc: 'Online Shopping', amount: -120, category: 'Shopping' },
  ],
  transfers: [
    { desc: 'Transfer to Savings', amount: -500, category: 'Transfer' },
    { desc: 'Transfer from Checking', amount: 500, category: 'Transfer' },
  ],
  fees: [
    { desc: 'Wire Transfer Fee', amount: -15, category: 'Fee' },
    { desc: 'Monthly Service Fee', amount: -12, category: 'Fee' },
    { desc: 'ATM Fee', amount: -3, category: 'Fee' },
  ],
};

function generateTransactionsForAccount(
  accountName: string,
  accountNumber: string,
  initialBalance: number,
  currency: string,
  frequency: { income: number; expenses: number; transfers: number; fees: number }
): Transaction[] {
  const transactions: Transaction[] = [];
  let balance = initialBalance;
  let currentDate = new Date(startDate);
  let txCounter = 1;

  // Opening balance
  transactions.push({
    date: formatDate(currentDate),
    description: 'Opening Balance',
    reference: `${accountNumber}-${String(txCounter++).padStart(6, '0')}`,
    amount: 0,
    balance: balance,
    currency: currency,
    category: 'Opening',
  });

  while (currentDate <= endDate) {
    // Income (bi-weekly on 1st and 15th)
    if (currentDate.getDate() === 1 || currentDate.getDate() === 15) {
      const income = transactionTypes.income[Math.floor(Math.random() * transactionTypes.income.length)];
      const amount = income.amount + (Math.random() * 100 - 50); // Add some variance
      balance += amount;
      transactions.push({
        date: formatDate(currentDate),
        description: income.desc,
        reference: `${accountNumber}-${String(txCounter++).padStart(6, '0')}`,
        credit: amount,
        amount: amount,
        balance: balance,
        currency: currency,
        category: income.category,
      });
    }

    // Monthly recurring expenses
    if (currentDate.getDate() === 1) {
      // Rent
      balance += transactionTypes.expenses[0].amount;
      transactions.push({
        date: formatDate(currentDate),
        description: transactionTypes.expenses[0].desc,
        reference: `${accountNumber}-${String(txCounter++).padStart(6, '0')}`,
        debit: Math.abs(transactionTypes.expenses[0].amount),
        amount: transactionTypes.expenses[0].amount,
        balance: balance,
        currency: currency,
        category: transactionTypes.expenses[0].category,
      });
    }

    if (currentDate.getDate() === 5) {
      // Utilities
      for (let i = 1; i <= 3; i++) {
        const expense = transactionTypes.expenses[i];
        const amount = expense.amount + (Math.random() * 20 - 10);
        balance += amount;
        transactions.push({
          date: formatDate(currentDate),
          description: expense.desc,
          reference: `${accountNumber}-${String(txCounter++).padStart(6, '0')}`,
          debit: Math.abs(amount),
          amount: amount,
          balance: balance,
          currency: currency,
          category: expense.category,
        });
      }
    }

    // Random daily expenses (60% chance)
    if (Math.random() < 0.6) {
      const expenseCount = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < expenseCount; i++) {
        const expense = transactionTypes.expenses[Math.floor(Math.random() * transactionTypes.expenses.length)];
        const amount = expense.amount + (Math.random() * 20 - 10);
        balance += amount;
        transactions.push({
          date: formatDate(currentDate),
          description: expense.desc,
          reference: `${accountNumber}-${String(txCounter++).padStart(6, '0')}`,
          debit: Math.abs(amount),
          amount: amount,
          balance: balance,
          currency: currency,
          category: expense.category,
        });
      }
    }

    // Monthly transfer to savings (1st of month)
    if (currentDate.getDate() === 1 && accountName.includes('Checking')) {
      const transfer = transactionTypes.transfers[0];
      balance += transfer.amount;
      transactions.push({
        date: formatDate(currentDate),
        description: transfer.desc,
        reference: `${accountNumber}-${String(txCounter++).padStart(6, '0')}`,
        debit: Math.abs(transfer.amount),
        amount: transfer.amount,
        balance: balance,
        currency: currency,
        category: transfer.category,
      });
    }

    // Random fees (5% chance)
    if (Math.random() < 0.05) {
      const fee = transactionTypes.fees[Math.floor(Math.random() * transactionTypes.fees.length)];
      balance += fee.amount;
      transactions.push({
        date: formatDate(currentDate),
        description: fee.desc,
        reference: `${accountNumber}-${String(txCounter++).padStart(6, '0')}`,
        debit: Math.abs(fee.amount),
        amount: fee.amount,
        balance: balance,
        currency: currency,
        category: fee.category,
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return transactions;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function transactionsToCSV(transactions: Transaction[]): string {
  const headers = 'Date,Description,Reference,Debit,Credit,Amount,Balance,Currency,Category\n';
  const rows = transactions.map((tx) => {
    return [
      tx.date,
      `"${tx.description}"`,
      tx.reference,
      tx.debit ? tx.debit.toFixed(2) : '',
      tx.credit ? tx.credit.toFixed(2) : '',
      tx.amount.toFixed(2),
      tx.balance.toFixed(2),
      tx.currency,
      tx.category || '',
    ].join(',');
  });
  return headers + rows.join('\n');
}

// Generate statements for multiple accounts
const accounts = [
  {
    name: 'Main Checking Account',
    number: 'CHK-1001234567',
    initialBalance: 5000,
    currency: 'USD',
  },
  {
    name: 'Business Checking Account',
    number: 'CHK-2001234567',
    initialBalance: 25000,
    currency: 'USD',
  },
  {
    name: 'Savings Account',
    number: 'SAV-3001234567',
    initialBalance: 15000,
    currency: 'USD',
  },
  {
    name: 'EUR Operations Account',
    number: 'CHK-4001234567',
    initialBalance: 50000,
    currency: 'EUR',
  },
];

// Create backup directory structure
const backupDir = resolve(process.cwd(), 'data/backups/bank-statements');
mkdirSync(backupDir, { recursive: true });

console.log('🏦 Generating Bank Statement CSV Files...');
console.log('');

accounts.forEach((account) => {
  console.log(`📄 Generating: ${account.name} (${account.number})`);
  
  const transactions = generateTransactionsForAccount(
    account.name,
    account.number,
    account.initialBalance,
    account.currency,
    { income: 2, expenses: 5, transfers: 1, fees: 0.1 }
  );

  const csv = transactionsToCSV(transactions);
  
  // Create account-specific directory
  const accountDir = resolve(backupDir, account.number);
  mkdirSync(accountDir, { recursive: true });
  
  // Save full statement
  const fileName = `${account.number}_statement_2023-2025.csv`;
  const filePath = resolve(accountDir, fileName);
  writeFileSync(filePath, csv);
  
  console.log(`   ✓ Generated ${transactions.length} transactions`);
  console.log(`   ✓ Saved to: ${filePath}`);
  console.log('');
});

// Create a README for the backup folder
const readmeContent = `# Bank Statement Backups

This folder contains raw bank statement CSV files for backup and recovery purposes.

## Structure

\`\`\`
data/backups/bank-statements/
├── CHK-1001234567/           # Main Checking Account
│   └── CHK-1001234567_statement_2023-2025.csv
├── CHK-2001234567/           # Business Checking Account
│   └── CHK-2001234567_statement_2023-2025.csv
├── SAV-3001234567/           # Savings Account
│   └── SAV-3001234567_statement_2023-2025.csv
└── CHK-4001234567/           # EUR Operations Account
    └── CHK-4001234567_statement_2023-2025.csv
\`\`\`

## File Format

All CSV files follow this format:
- **Date**: YYYY-MM-DD format
- **Description**: Transaction description
- **Reference**: Unique transaction reference (account-xxxxxx)
- **Debit**: Amount debited (if applicable)
- **Credit**: Amount credited (if applicable)
- **Amount**: Net amount (negative for debit, positive for credit)
- **Balance**: Running balance after transaction
- **Currency**: ISO currency code (USD, EUR, etc.)
- **Category**: Transaction category for reporting

## Usage

### Import to TreasuryX

1. Go to \`/connections/new\`
2. Upload CSV file
3. Map columns:
   - Date → Date
   - Description → Description
   - Amount → Amount
   - Reference → Reference (optional)
   - Balance → Balance (optional)
   - Category → Category (optional)
4. Preview and import

### Backfill/Recovery

If you need to backfill or reload data:
1. Delete connection from \`/connections\`
2. Re-import CSV with "Override" mode to replace all data
3. Or use "Append" mode to add missing transactions

## Generated

Generated on: ${new Date().toISOString()}
Period: January 1, 2023 - January 14, 2025
Accounts: ${accounts.length}
Total transactions: ~${accounts.length * 730 * 2} (approximate)

## Notes

- Opening balances are set at the start of 2023
- Transactions include realistic patterns:
  - Bi-weekly salary deposits (1st & 15th)
  - Monthly recurring expenses (rent, utilities)
  - Daily random expenses (groceries, dining, etc.)
  - Monthly transfers to savings
  - Occasional fees
- Each transaction has a unique reference number
- Balances are calculated sequentially
- Multi-currency support (USD, EUR)
`;

writeFileSync(resolve(backupDir, 'README.md'), readmeContent);

console.log('═══════════════════════════════════════════════════════════');
console.log('✅ Bank Statement Generation Complete!');
console.log('');
console.log(`📁 Files saved to: ${backupDir}`);
console.log('');
console.log('You can now:');
console.log('1. Import these files via /connections/new');
console.log('2. Use them for testing');
console.log('3. Keep them as backups for recovery');
console.log('');
console.log('═══════════════════════════════════════════════════════════');

