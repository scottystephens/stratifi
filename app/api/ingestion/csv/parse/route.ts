// API route for parsing CSV with column mapping
// POST /api/ingestion/csv/parse

import { NextRequest, NextResponse } from 'next/server';
import { CSVParser, ColumnMapping } from '@/lib/parsers/csv-parser';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, columnMapping, config } = body;
    
    if (!content) {
      return NextResponse.json(
        { error: 'No CSV content provided' },
        { status: 400 }
      );
    }
    
    if (!columnMapping || !columnMapping.date || !columnMapping.amount || !columnMapping.description) {
      return NextResponse.json(
        { error: 'Column mapping is incomplete. Required: date, amount, description' },
        { status: 400 }
      );
    }
    
    // Parse CSV with provided mapping
    const parser = new CSVParser({
      columnMapping: columnMapping as ColumnMapping,
      ...config,
    });
    
    const result = await parser.parse(content);
    
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          errors: result.errors,
          warnings: result.warnings,
          summary: result.summary,
        },
        { status: 400 }
      );
    }
    
    // Return parsed transactions (preview only, not imported yet)
    return NextResponse.json({
      success: true,
      transactions: result.transactions,
      errors: result.errors,
      warnings: result.warnings,
      summary: result.summary,
    });
    
  } catch (error) {
    console.error('CSV parse error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Parse failed' },
      { status: 500 }
    );
  }
}

