// API route for uploading CSV files and parsing them
// POST /api/ingestion/csv/upload

import { NextRequest, NextResponse } from 'next/server';
import { CSVParser } from '@/lib/parsers/csv-parser';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Validate file type
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Only CSV files are supported' },
        { status: 400 }
      );
    }
    
    // Read file content
    const content = await file.text();
    
    // Detect columns for the UI to map
    const { columns, sampleRows } = await CSVParser.detectColumns(content);
    
    // Suggest column mapping
    const suggestedMapping = CSVParser.suggestColumnMapping(columns);
    
    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileSize: file.size,
      columns,
      sampleRows,
      suggestedMapping,
      content, // Send back content for later processing
    });
    
  } catch (error) {
    console.error('CSV upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

