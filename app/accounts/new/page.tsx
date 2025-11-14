'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { useAuth } from '@/lib/auth-context';
import { Navigation } from '@/components/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking Account' },
  { value: 'savings', label: 'Savings Account' },
  { value: 'money_market', label: 'Money Market Account' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'loan', label: 'Loan Account' },
  { value: 'investment', label: 'Investment Account' },
  { value: 'other', label: 'Other' },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY'];

export default function NewAccountPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  // Basic fields
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('checking');
  const [currency, setCurrency] = useState('USD');
  
  // Bank information
  const [bankName, setBankName] = useState('');
  const [bankIdentifier, setBankIdentifier] = useState('');
  const [branchName, setBranchName] = useState('');
  
  // Financial details
  const [openingBalance, setOpeningBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [overdraftLimit, setOverdraftLimit] = useState('');
  
  // Categorization
  const [businessUnit, setBusinessUnit] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [glAccountCode, setGlAccountCode] = useState('');
  const [purpose, setPurpose] = useState('');
  
  // Custom fields (up to 10)
  const [customFields, setCustomFields] = useState<Array<{ label: string; value: string }>>([
    { label: '', value: '' },
  ]);
  
  const [notes, setNotes] = useState('');

  function addCustomField() {
    if (customFields.length < 10) {
      setCustomFields([...customFields, { label: '', value: '' }]);
    }
  }

  function updateCustomField(index: number, field: 'label' | 'value', value: string) {
    const updated = [...customFields];
    updated[index][field] = value;
    setCustomFields(updated);
  }

  function removeCustomField(index: number) {
    setCustomFields(customFields.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!currentTenant || !user) {
      alert('Please ensure you are logged in');
      return;
    }

    if (!accountName || !accountType) {
      alert('Please fill in required fields: Account Name and Account Type');
      return;
    }

    try {
      setSaving(true);

      // Build custom_fields object (only non-empty fields)
      const customFieldsObj: Record<string, any> = {};
      customFields.forEach((field, index) => {
        if (field.label && field.value) {
          customFieldsObj[`custom_${index + 1}`] = {
            label: field.label,
            value: field.value,
          };
        }
      });

      const account = {
        tenant_id: currentTenant.id,
        account_name: accountName,
        account_number: accountNumber || undefined,
        account_type: accountType,
        account_status: 'active',
        bank_name: bankName || undefined,
        bank_identifier: bankIdentifier || undefined,
        branch_name: branchName || undefined,
        currency: currency,
        current_balance: openingBalance ? parseFloat(openingBalance) : 0,
        available_balance: openingBalance ? parseFloat(openingBalance) : 0,
        credit_limit: creditLimit ? parseFloat(creditLimit) : undefined,
        overdraft_limit: overdraftLimit ? parseFloat(overdraftLimit) : undefined,
        business_unit: businessUnit || undefined,
        cost_center: costCenter || undefined,
        gl_account_code: glAccountCode || undefined,
        purpose: purpose || undefined,
        custom_fields: Object.keys(customFieldsObj).length > 0 ? customFieldsObj : undefined,
        notes: notes || undefined,
        created_by: user.id,
      };

      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(account),
      });

      const data = await response.json();

      if (data.success) {
        router.push('/accounts');
      } else {
        alert(`Failed to create account: ${data.error}`);
      }
    } catch (error) {
      console.error('Error creating account:', error);
      alert('Failed to create account');
    } finally {
      setSaving(false);
    }
  }

  if (!currentTenant) {
    return (
      <div className="flex h-screen">
        <Navigation />
        <main className="flex-1 overflow-y-auto bg-background p-8">
          <Card className="p-12 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-4">No Organization Selected</h2>
            <p className="text-muted-foreground">
              Please select an organization from the sidebar.
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
              onClick={() => router.push('/accounts')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Accounts
            </Button>
            <h1 className="text-3xl font-bold">New Account</h1>
            <p className="text-muted-foreground mt-2">
              Add a new bank or financial account
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              {/* Basic Information */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="block font-medium mb-2">
                      Account Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., Chase Business Checking"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">
                      Account Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      required
                    >
                      {ACCOUNT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium mb-2">Account Number</label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., 1234567890"
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    >
                      {CURRENCIES.map((curr) => (
                        <option key={curr} value={curr}>
                          {curr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium mb-2">Opening Balance</label>
                    <input
                      type="number"
                      step="0.01"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </Card>

              {/* Bank Information */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Bank Information</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block font-medium mb-2">Bank Name</label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., Chase Bank"
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">
                      Bank Identifier (SWIFT/Routing)
                    </label>
                    <input
                      type="text"
                      value={bankIdentifier}
                      onChange={(e) => setBankIdentifier(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., CHASUS33 or 021000021"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block font-medium mb-2">Branch Name</label>
                    <input
                      type="text"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., Manhattan Main Branch"
                    />
                  </div>
                </div>
              </Card>

              {/* Limits & Controls */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Limits & Controls</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block font-medium mb-2">Credit Limit</label>
                    <input
                      type="number"
                      step="0.01"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">Overdraft Limit</label>
                    <input
                      type="number"
                      step="0.01"
                      value={overdraftLimit}
                      onChange={(e) => setOverdraftLimit(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </Card>

              {/* Categorization */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Categorization</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block font-medium mb-2">Business Unit</label>
                    <input
                      type="text"
                      value={businessUnit}
                      onChange={(e) => setBusinessUnit(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., North America Operations"
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">Cost Center</label>
                    <input
                      type="text"
                      value={costCenter}
                      onChange={(e) => setCostCenter(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., CC-1001"
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-2">GL Account Code</label>
                    <input
                      type="text"
                      value={glAccountCode}
                      onChange={(e) => setGlAccountCode(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., 1000-100-001"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block font-medium mb-2">Purpose</label>
                    <input
                      type="text"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g., Operating expenses for Q1 2025"
                    />
                  </div>
                </div>
              </Card>

              {/* Custom Fields */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Custom Fields</h2>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCustomField}
                    disabled={customFields.length >= 10}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Field
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Add up to 10 custom fields to track additional information
                </p>

                <div className="space-y-3">
                  {customFields.map((field, index) => (
                    <div key={index} className="grid grid-cols-[1fr,1fr,auto] gap-2">
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateCustomField(index, 'label', e.target.value)}
                        className="border rounded px-3 py-2"
                        placeholder="Field Name (e.g., Project Code)"
                      />
                      <input
                        type="text"
                        value={field.value}
                        onChange={(e) => updateCustomField(index, 'value', e.target.value)}
                        className="border rounded px-3 py-2"
                        placeholder="Value"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCustomField(index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Notes */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Notes</h2>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  rows={4}
                  placeholder="Add any additional notes or documentation..."
                />
              </Card>

              {/* Actions */}
              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/accounts')}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Creating...' : 'Create Account'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

