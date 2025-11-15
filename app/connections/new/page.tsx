'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { useAuth } from '@/lib/auth-context';
import { Navigation } from '@/components/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BankingProviderCard } from '@/components/banking-provider-card';
import { Upload, ArrowRight, ArrowLeft, FileText, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import type { Account } from '@/lib/supabase';

// Step 0: Connection Type Selection
// Step 1: File Upload (CSV) or Banking Provider OAuth (Tink)
// Step 2: Column Mapping (CSV only)
// Step 3: Preview & Config (CSV only)
// Step 4: Import & Results

type ConnectionType = 'csv' | null;
type Step = 'select-type' | 'upload' | 'mapping' | 'preview' | 'results';

interface UploadedFile {
  fileName: string;
  fileSize: number;
  content: string;
  columns: string[];
  sampleRows: Record<string, any>[];
  suggestedMapping: Record<string, string>;
  detectedDataType?: {
    dataType: 'transactions' | 'statements' | 'unknown';
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  };
}

interface ParsedData {
  transactions: any[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
  };
  errors: any[];
  warnings: string[];
}

export default function NewConnectionPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  
  const [connectionType, setConnectionType] = useState<ConnectionType>(null);
  const [step, setStep] = useState<Step>('select-type');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [connectionName, setConnectionName] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [importMode, setImportMode] = useState<'append' | 'override'>('append');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [bankingProviders, setBankingProviders] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Load accounts and providers when currentTenant changes
  useEffect(() => {
    if (currentTenant) {
      loadAccounts();
      loadBankingProviders();
    }
  }, [currentTenant]);

  async function loadBankingProviders() {
    try {
      setLoadingProviders(true);
      const response = await fetch('/api/banking/providers');
      const data = await response.json();

      if (data.success) {
        setBankingProviders(data.providers);
      }
    } catch (error) {
      console.error('Error loading banking providers:', error);
    } finally {
      setLoadingProviders(false);
    }
  }

  async function loadAccounts() {
    if (!currentTenant) return;

    try {
      setLoadingAccounts(true);
      const response = await fetch(`/api/accounts?tenantId=${currentTenant.id}`);
      const data = await response.json();

      if (data.success) {
        setAccounts(data.accounts);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoadingAccounts(false);
    }
  }

  // Step 1: Handle file upload
  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/ingestion/csv/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setUploadedFile(data);
        setConnectionName(data.fileName.replace('.csv', ''));
        setColumnMapping(data.suggestedMapping || {});
        setStep('mapping');
      } else {
        alert(`Upload failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file');
    }
  }

  // Step 2: Parse and preview
  async function handleParsePreview() {
    if (!uploadedFile) return;

    try {
      const response = await fetch('/api/ingestion/csv/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: uploadedFile.content,
          columnMapping,
          config: {},
        }),
      });

      const data = await response.json();

      if (data.success) {
        setParsedData(data);
        setStep('preview');
      } else {
        alert(`Parse failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Parse error:', error);
      alert('Failed to parse CSV');
    }
  }

  // Step 3: Import
  async function handleImport() {
    if (!uploadedFile || !currentTenant || !user) {
      alert('Missing required information. Please ensure you are logged in.');
      return;
    }

    console.log('🚀 Starting import with:', {
      userId: user.id,
      userEmail: user.email,
      tenantId: currentTenant.id,
      tenantName: currentTenant.name,
      accountId: selectedAccountId || 'none',
      connectionName,
      importMode,
    });

    try {
      setImporting(true);
      const response = await fetch('/api/ingestion/csv/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: uploadedFile.content,
          fileName: uploadedFile.fileName,
          fileSize: uploadedFile.fileSize,
          columnMapping,
          config: {},
          connectionName,
          accountId: selectedAccountId,
          tenantId: currentTenant.id,
          importMode,
          userId: user.id, // Pass user ID from auth context
        }),
      });

      const data = await response.json();

      if (data.success) {
        setImportResult(data);
        setStep('results');
      } else {
        console.error('❌ Import failed:', data);
        const debugInfo = data.debug || data.details || data.errorObject || 'No additional info';
        alert(`Import failed: ${data.error}\n\nDetails: ${typeof debugInfo === 'string' ? debugInfo : JSON.stringify(debugInfo, null, 2)}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import CSV');
    } finally {
      setImporting(false);
    }
  }

  if (!currentTenant) {
    return (
      <div className="flex h-screen">
        <Navigation />
        <main className="flex-1 overflow-y-auto bg-background p-8">
          <Card className="p-12 text-center max-w-2xl mx-auto mt-8">
            <h2 className="text-2xl font-semibold mb-4">No Organization Selected</h2>
            <p className="text-muted-foreground mb-6">
              Please select an organization from the sidebar to import data.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Navigation />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {/* Header */}
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={() => router.push('/connections')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Connections
            </Button>
            <h1 className="text-3xl font-bold">
              {connectionType === 'csv' ? 'Import CSV Data' : 'New Connection'}
            </h1>
            <p className="text-muted-foreground mt-2">
              {connectionType === 'csv'
                ? 'Upload and configure your transaction data'
                : 'Choose how you want to connect your data'}
            </p>
          </div>

          {/* Step 0: Select Connection Type */}
          {step === 'select-type' && (
            <div className="space-y-8">
              {/* Banking Providers */}
              {bankingProviders.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Banking Providers</h2>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    {bankingProviders.map((provider) => (
                      <BankingProviderCard
                        key={provider.id}
                        provider={provider}
                        tenantId={currentTenant?.id || ''}
                        onError={(err) => console.error('Provider error:', err)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* CSV Import Option */}
              <div>
                <h2 className="text-xl font-semibold mb-4">Manual Import</h2>
                <Card
                  className="p-8 cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-blue-500 max-w-md"
                  onClick={() => {
                    setConnectionType('csv');
                    setStep('upload');
                  }}
                >
                  <div className="text-center">
                    <div className="flex justify-center mb-4">
                      <FileSpreadsheet className="h-16 w-16 text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-semibold mb-2">CSV Import</h2>
                    <p className="text-muted-foreground mb-4">
                      Upload a CSV file with your bank statements or transactions
                    </p>
                    <Badge variant="secondary">Manual Upload</Badge>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Step Indicator (CSV only) */}
          {connectionType === 'csv' && step !== 'select-type' && (
            <div className="flex items-center justify-between mb-8">
              {['upload', 'mapping', 'preview', 'results'].map((s, index) => (
                <div key={s} className="flex items-center flex-1">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${
                      step === s
                        ? 'bg-blue-600 text-white'
                        : ['upload', 'mapping', 'preview'].indexOf(step) > index
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <span className="ml-2 text-sm font-medium capitalize">{s}</span>
                  {index < 3 && <div className="flex-1 h-0.5 bg-gray-200 mx-4" />}
                </div>
              ))}
            </div>
          )}

          {/* Step 1: Upload - CSV */}
          {step === 'upload' && connectionType === 'csv' && (
            <Card className="p-8">
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <Upload className="h-16 w-16 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-semibold mb-2">Upload CSV File</h2>
                <p className="text-muted-foreground mb-6">
                  Select a CSV file containing your bank statements or transactions
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label 
                  htmlFor="file-upload"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 cursor-pointer transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  Choose File
                </label>
                <div className="mt-4">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setConnectionType(null);
                      setStep('select-type');
                    }}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Choose Different Connection Type
                  </Button>
                </div>
              </div>
            </Card>
          )}


          {/* Step 2: Column Mapping */}
          {step === 'mapping' && uploadedFile && (
            <Card className="p-8">
              <h2 className="text-2xl font-semibold mb-4">Map Columns</h2>
              <p className="text-muted-foreground mb-6">
                Match your CSV columns to transaction fields
              </p>

              {/* Data Type Detection Result */}
              {uploadedFile.detectedDataType && (
                <div className={`p-4 rounded-lg mb-6 ${
                  uploadedFile.detectedDataType.confidence === 'high' 
                    ? 'bg-green-50 border border-green-200'
                    : uploadedFile.detectedDataType.confidence === 'medium'
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-yellow-50 border border-yellow-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {uploadedFile.detectedDataType.dataType === 'transactions' ? '💰' : 
                       uploadedFile.detectedDataType.dataType === 'statements' ? '📊' : '❓'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">
                          Detected: {uploadedFile.detectedDataType.dataType === 'transactions' ? 'Transaction Data' : 
                                   uploadedFile.detectedDataType.dataType === 'statements' ? 'Statement Data' : 
                                   'Unknown Data Type'}
                        </span>
                        <Badge className={
                          uploadedFile.detectedDataType.confidence === 'high' 
                            ? 'bg-green-100 text-green-800'
                            : uploadedFile.detectedDataType.confidence === 'medium'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }>
                          {uploadedFile.detectedDataType.confidence} confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {uploadedFile.detectedDataType.reason}
                      </p>
                      {uploadedFile.detectedDataType.dataType === 'statements' && (
                        <p className="text-xs text-amber-600 mt-2">
                          💡 Statement data will be imported to track daily balances and summaries.
                        </p>
                      )}
                      {uploadedFile.detectedDataType.dataType === 'transactions' && (
                        <p className="text-xs text-green-600 mt-2">
                          💡 Transaction data will be imported as individual transaction records.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4 mb-6">
                {/* Required mappings */}
                {['date', 'amount', 'description'].map((field) => (
                  <div key={field} className="grid grid-cols-2 gap-4 items-center">
                    <label className="font-medium capitalize">
                      {field} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={columnMapping[field] || ''}
                      onChange={(e) =>
                        setColumnMapping({ ...columnMapping, [field]: e.target.value })
                      }
                      className="border rounded px-3 py-2"
                    >
                      <option value="">-- Select Column --</option>
                      {uploadedFile.columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                {/* Optional mappings */}
                {['type', 'reference', 'balance'].map((field) => (
                  <div key={field} className="grid grid-cols-2 gap-4 items-center">
                    <label className="font-medium capitalize text-muted-foreground">
                      {field} (optional)
                    </label>
                    <select
                      value={columnMapping[field] || ''}
                      onChange={(e) =>
                        setColumnMapping({ ...columnMapping, [field]: e.target.value })
                      }
                      className="border rounded px-3 py-2"
                    >
                      <option value="">-- Select Column --</option>
                      {uploadedFile.columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Sample Data Preview */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-semibold mb-2">Sample Data</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {uploadedFile.columns.map((col) => (
                          <th key={col} className="text-left p-2">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadedFile.sampleRows.slice(0, 3).map((row, idx) => (
                        <tr key={idx} className="border-b">
                          {uploadedFile.columns.map((col) => (
                            <td key={col} className="p-2">
                              {row[col]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('upload');
                    setUploadedFile(null);
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleParsePreview}
                  disabled={!columnMapping.date || !columnMapping.amount || !columnMapping.description}
                >
                  Next: Preview
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </Card>
          )}

          {/* Step 3: Preview & Config */}
          {step === 'preview' && parsedData && (
            <Card className="p-8">
              <h2 className="text-2xl font-semibold mb-4">Preview & Configure</h2>
              
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="border rounded p-4 text-center">
                  <div className="text-3xl font-bold">{parsedData.summary.totalRows}</div>
                  <div className="text-sm text-muted-foreground">Total Rows</div>
                </div>
                <div className="border rounded p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">{parsedData.summary.validRows}</div>
                  <div className="text-sm text-muted-foreground">Valid</div>
                </div>
                <div className="border rounded p-4 text-center">
                  <div className="text-3xl font-bold text-red-600">{parsedData.summary.invalidRows}</div>
                  <div className="text-sm text-muted-foreground">Invalid</div>
                </div>
              </div>

              {/* Errors/Warnings */}
              {parsedData.errors.length > 0 && (
                <div className="border border-red-200 rounded p-4 mb-4 bg-red-50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <span className="font-semibold text-red-800">Errors Found</span>
                  </div>
                  <ul className="text-sm text-red-700 space-y-1">
                    {parsedData.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>Row {err.row}: {err.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Configuration */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block font-medium mb-2">Connection Name</label>
                  <input
                    type="text"
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., Chase Checking Account"
                  />
                </div>

                <div>
                  <label className="block font-medium mb-2">Link to Account (Optional)</label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    disabled={loadingAccounts}
                  >
                    <option value="">-- None (Import without account link) --</option>
                    {accounts.map((account) => (
                      <option key={account.account_id || account.id} value={account.account_id || account.id}>
                        {account.account_name} ({account.currency || 'USD'})
                        {account.account_number && ` - ••••${account.account_number.slice(-4)}`}
                      </option>
                    ))}
                  </select>
                  {accounts.length === 0 && !loadingAccounts && (
                    <p className="text-xs text-amber-600 mt-1">
                      No accounts found.{' '}
                      <a href="/accounts/new" className="underline">
                        Create an account first
                      </a>
                    </p>
                  )}
                  {accounts.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Link transactions to an existing account or import without linking
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-medium mb-2">Import Mode</label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="append"
                        checked={importMode === 'append'}
                        onChange={() => setImportMode('append')}
                        className="mr-2"
                      />
                      <span>Append - Add new transactions (recommended)</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="override"
                        checked={importMode === 'override'}
                        onChange={() => setImportMode('override')}
                        className="mr-2"
                      />
                      <span>Override - Replace all transactions from this connection</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Transaction Preview */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 p-4 font-semibold">
                  Transaction Preview (First 5)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Description</th>
                        <th className="text-right p-2">Amount</th>
                        <th className="text-left p-2">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.transactions.slice(0, 5).map((tx, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{tx.date}</td>
                          <td className="p-2">{tx.description}</td>
                          <td className="p-2 text-right">${tx.amount.toFixed(2)}</td>
                          <td className="p-2">
                            <Badge>{tx.type}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('mapping');
                    setParsedData(null);
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importing || !connectionName}
                >
                  {importing ? 'Importing...' : 'Import Transactions'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </Card>
          )}

          {/* Step 4: Results */}
          {step === 'results' && importResult && (
            <Card className="p-8 text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="h-16 w-16 text-green-600" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">Import Complete!</h2>
              <p className="text-muted-foreground mb-6">
                Your transactions have been successfully imported
              </p>

              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-3xl font-bold text-green-600">
                      {importResult.summary.imported}
                    </div>
                    <div className="text-sm text-muted-foreground">Imported</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">{importResult.summary.totalRows}</div>
                    <div className="text-sm text-muted-foreground">Total</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-red-600">
                      {importResult.summary.skipped}
                    </div>
                    <div className="text-sm text-muted-foreground">Skipped</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 justify-center">
                <Button variant="outline" onClick={() => router.push('/connections')}>
                  View Connections
                </Button>
                <Button
                  onClick={() => {
                    setStep('select-type');
                    setConnectionType(null);
                    setUploadedFile(null);
                    setColumnMapping({});
                    setParsedData(null);
                    setImportResult(null);
                    setConnectionName('');
                    setSelectedAccountId('');
                  }}
                >
                  Create Another Connection
                </Button>
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

