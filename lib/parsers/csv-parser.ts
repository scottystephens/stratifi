// CSV Parser for bank statements and transactions
// Handles various CSV formats with configurable column mapping

import Papa from 'papaparse';

export interface ColumnMapping {
  date: string;           // Column name for transaction date
  amount: string;         // Column name for amount
  description: string;    // Column name for description
  type?: string;          // Optional: debit/credit indicator column
  balance?: string;       // Optional: balance after transaction
  reference?: string;     // Optional: transaction reference/ID
  category?: string;      // Optional: transaction category
  // Allow any other columns to be preserved in metadata
  [key: string]: string | undefined;
}

export interface CSVParserConfig {
  columnMapping: ColumnMapping;
  dateFormat?: string;    // e.g., 'MM/DD/YYYY', 'YYYY-MM-DD'
  delimiter?: string;     // Default: auto-detect
  hasHeader?: boolean;    // Default: true
  skipRows?: number;      // Skip N rows at start (for headers/footers)
  amountFormat?: {
    decimalSeparator?: '.' | ',';
    negativePattern?: 'parentheses' | 'minus'; // (100.00) vs -100.00
    debitPositive?: boolean; // Are debits positive or negative?
  };
}

export interface ParsedTransaction {
  date: string;           // ISO date string
  amount: number;         // Normalized to number
  description: string;
  type?: 'debit' | 'credit';
  balance?: number;
  reference?: string;
  category?: string;
  metadata: Record<string, any>; // All other columns
  rawRow: Record<string, any>;   // Original row data
  rowNumber: number;
}

export interface CSVParseResult {
  success: boolean;
  transactions: ParsedTransaction[];
  errors: Array<{
    row: number;
    field?: string;
    message: string;
    value?: any;
  }>;
  warnings: string[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    columns: string[];
  };
}

export class CSVParser {
  private config: CSVParserConfig;
  
  constructor(config: CSVParserConfig) {
    this.config = {
      hasHeader: true,
      skipRows: 0,
      amountFormat: {
        decimalSeparator: '.',
        negativePattern: 'minus',
        debitPositive: false,
      },
      ...config,
    };
  }
  
  /**
   * Parse CSV file content
   */
  async parse(csvContent: string): Promise<CSVParseResult> {
    const result: CSVParseResult = {
      success: false,
      transactions: [],
      errors: [],
      warnings: [],
      summary: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        columns: [],
      },
    };
    
    try {
      // Parse CSV using PapaParse
      const parsed = Papa.parse(csvContent, {
        header: this.config.hasHeader,
        delimiter: this.config.delimiter,
        skipEmptyLines: true,
        dynamicTyping: false, // Keep as strings for custom parsing
        transformHeader: (header) => header.trim(),
      });
      
      if (parsed.errors.length > 0) {
        result.errors.push(
          ...parsed.errors.map((err) => ({
            row: err.row || 0,
            message: err.message,
          }))
        );
      }
      
      const rows = parsed.data as Record<string, any>[];
      
      // Skip rows if configured
      const dataRows = rows.slice(this.config.skipRows || 0);
      
      result.summary.totalRows = dataRows.length;
      result.summary.columns = Object.keys(dataRows[0] || {});
      
      // Validate column mapping
      const mappingErrors = this.validateColumnMapping(result.summary.columns);
      if (mappingErrors.length > 0) {
        result.errors.push(...mappingErrors);
        return result;
      }
      
      // Parse each row
      dataRows.forEach((row, index) => {
        const rowNumber = index + 1 + (this.config.skipRows || 0);
        
        try {
          const transaction = this.parseRow(row, rowNumber);
          result.transactions.push(transaction);
          result.summary.validRows++;
        } catch (error) {
          result.errors.push({
            row: rowNumber,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          result.summary.invalidRows++;
        }
      });
      
      result.success = result.errors.length === 0 || result.transactions.length > 0;
      
      // Add warnings
      if (result.summary.invalidRows > 0) {
        result.warnings.push(
          `${result.summary.invalidRows} rows could not be parsed and will be skipped`
        );
      }
      
      if (result.summary.validRows === 0) {
        result.errors.push({
          row: 0,
          message: 'No valid transactions found in CSV file',
        });
        result.success = false;
      }
      
    } catch (error) {
      result.errors.push({
        row: 0,
        message: `CSV parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
    
    return result;
  }
  
  /**
   * Validate that required columns exist in the CSV
   */
  private validateColumnMapping(columns: string[]): Array<{ row: number; field?: string; message: string }> {
    const errors: Array<{ row: number; field?: string; message: string }> = [];
    const mapping = this.config.columnMapping;
    
    // Check required fields
    if (!columns.includes(mapping.date)) {
      errors.push({
        row: 0,
        field: 'date',
        message: `Date column "${mapping.date}" not found in CSV. Available columns: ${columns.join(', ')}`,
      });
    }
    
    if (!columns.includes(mapping.amount)) {
      errors.push({
        row: 0,
        field: 'amount',
        message: `Amount column "${mapping.amount}" not found in CSV. Available columns: ${columns.join(', ')}`,
      });
    }
    
    if (!columns.includes(mapping.description)) {
      errors.push({
        row: 0,
        field: 'description',
        message: `Description column "${mapping.description}" not found in CSV. Available columns: ${columns.join(', ')}`,
      });
    }
    
    return errors;
  }
  
  /**
   * Parse a single row into a transaction
   */
  private parseRow(row: Record<string, any>, rowNumber: number): ParsedTransaction {
    const mapping = this.config.columnMapping;
    
    // Parse date
    const dateStr = row[mapping.date];
    if (!dateStr) {
      throw new Error(`Missing date value`);
    }
    const date = this.parseDate(dateStr);
    
    // Parse amount
    const amountStr = row[mapping.amount];
    if (!amountStr) {
      throw new Error(`Missing amount value`);
    }
    const amount = this.parseAmount(amountStr);
    
    // Get description
    const description = row[mapping.description] || '';
    
    // Parse optional fields
    const type = mapping.type ? this.parseType(row[mapping.type]) : this.inferType(amount);
    const balance = mapping.balance ? this.parseAmount(row[mapping.balance], true) : undefined;
    const reference = mapping.reference ? row[mapping.reference] : undefined;
    const category = mapping.category ? row[mapping.category] : undefined;
    
    // Collect all other columns as metadata
    const metadata: Record<string, any> = {};
    Object.keys(row).forEach((key) => {
      if (
        key !== mapping.date &&
        key !== mapping.amount &&
        key !== mapping.description &&
        key !== mapping.type &&
        key !== mapping.balance &&
        key !== mapping.reference &&
        key !== mapping.category
      ) {
        metadata[key] = row[key];
      }
    });
    
    return {
      date,
      amount,
      description,
      type,
      balance,
      reference,
      category,
      metadata,
      rawRow: row,
      rowNumber,
    };
  }
  
  /**
   * Parse date string to ISO format
   */
  private parseDate(dateStr: string): string {
    // Clean the date string
    const cleaned = dateStr.trim();
    
    // Try parsing as Date
    const date = new Date(cleaned);
    
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }
    
    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
  }
  
  /**
   * Parse amount string to number
   */
  private parseAmount(amountStr: string, allowEmpty = false): number {
    if (!amountStr && allowEmpty) {
      return 0;
    }
    
    if (!amountStr) {
      throw new Error('Missing amount');
    }
    
    // Clean the amount string
    let cleaned = amountStr.trim();
    
    // Handle parentheses for negative (accounting format)
    const isParentheses = cleaned.startsWith('(') && cleaned.endsWith(')');
    if (isParentheses) {
      cleaned = cleaned.slice(1, -1);
    }
    
    // Remove currency symbols and whitespace
    cleaned = cleaned.replace(/[$£€¥,\s]/g, '');
    
    // Handle decimal separator
    if (this.config.amountFormat?.decimalSeparator === ',') {
      cleaned = cleaned.replace(',', '.');
    }
    
    // Parse to number
    const amount = parseFloat(cleaned);
    
    if (isNaN(amount)) {
      throw new Error(`Invalid amount format: ${amountStr}`);
    }
    
    // Apply negative if in parentheses
    return isParentheses ? -amount : amount;
  }
  
  /**
   * Parse transaction type
   */
  private parseType(typeStr: string): 'debit' | 'credit' {
    const cleaned = typeStr.toLowerCase().trim();
    
    if (cleaned.includes('debit') || cleaned.includes('dr') || cleaned === 'd') {
      return 'debit';
    }
    
    if (cleaned.includes('credit') || cleaned.includes('cr') || cleaned === 'c') {
      return 'credit';
    }
    
    // Default to credit
    return 'credit';
  }
  
  /**
   * Infer transaction type from amount
   */
  private inferType(amount: number): 'debit' | 'credit' {
    // If debits are positive in the source data, flip the logic
    if (this.config.amountFormat?.debitPositive) {
      return amount >= 0 ? 'debit' : 'credit';
    }
    
    // Standard: negative = debit, positive = credit
    return amount < 0 ? 'debit' : 'credit';
  }
  
  /**
   * Static method to detect CSV columns (for UI column mapper)
   */
  static async detectColumns(csvContent: string): Promise<{
    columns: string[];
    sampleRows: Record<string, any>[];
  }> {
    const parsed = Papa.parse(csvContent, {
      header: true,
      preview: 5, // Only parse first 5 rows for detection
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });
    
    const rows = parsed.data as Record<string, any>[];
    const columns = Object.keys(rows[0] || {});
    
    return {
      columns,
      sampleRows: rows,
    };
  }
  
  /**
   * Static method to suggest column mapping based on column names
   */
  static suggestColumnMapping(columns: string[]): Partial<ColumnMapping> {
    const suggestions: Partial<ColumnMapping> = {};
    
    const lowerColumns = columns.map((c) => c.toLowerCase());
    
    // Suggest date column
    const dateIdx = lowerColumns.findIndex((c) =>
      c.includes('date') || c.includes('trans date') || c.includes('posted date')
    );
    if (dateIdx >= 0) suggestions.date = columns[dateIdx];
    
    // Suggest amount column
    const amountIdx = lowerColumns.findIndex((c) =>
      c.includes('amount') || c.includes('value') || c.includes('debit') || c.includes('credit')
    );
    if (amountIdx >= 0) suggestions.amount = columns[amountIdx];
    
    // Suggest description column
    const descIdx = lowerColumns.findIndex((c) =>
      c.includes('description') || c.includes('memo') || c.includes('narrative') || c.includes('details')
    );
    if (descIdx >= 0) suggestions.description = columns[descIdx];
    
    // Suggest type column
    const typeIdx = lowerColumns.findIndex((c) =>
      c.includes('type') || c.includes('dr/cr') || c.includes('debit/credit')
    );
    if (typeIdx >= 0) suggestions.type = columns[typeIdx];
    
    // Suggest balance column
    const balanceIdx = lowerColumns.findIndex((c) =>
      c.includes('balance') || c.includes('running balance')
    );
    if (balanceIdx >= 0) suggestions.balance = columns[balanceIdx];
    
    // Suggest reference column
    const refIdx = lowerColumns.findIndex((c) =>
      c.includes('reference') || c.includes('ref') || c.includes('transaction id') || c.includes('check')
    );
    if (refIdx >= 0) suggestions.reference = columns[refIdx];
    
    return suggestions;
  }
}

