'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Plus, Save } from 'lucide-react';
import type { Account } from '@/lib/supabase';
import { toast } from 'sonner';

interface CustomField {
  id: string;
  label: string;
  value: string;
}

interface EditAccountModalProps {
  account: Account;
  tenantId: string;
  onClose: () => void;
  onSave: () => void;
}

export function EditAccountModal({
  account,
  tenantId,
  onClose,
  onSave,
}: EditAccountModalProps) {
  const [formData, setFormData] = useState({
    account_name: account.account_name || '',
    account_number: account.account_number || '',
    bank_name: account.bank_name || '',
    account_type: account.account_type || '',
    currency: account.currency || 'USD',
    iban: account.iban || '',
    bic: account.bic || '',
    account_holder_name: account.account_holder_name || '',
    notes: account.notes || '',
  });

  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldDraft, setCustomFieldDraft] = useState({ label: '', value: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (account?.custom_fields) {
      const value = account.custom_fields;
      let parsed: CustomField[] = [];
      if (Array.isArray(value)) {
        parsed = value
          .filter((field: any) => field && field.label)
          .slice(0, 10)
          .map((field: any, idx: number) => ({
            id: field.id || `field-${idx}`,
            label: field.label,
            value: field.value ?? '',
          }));
      } else if (typeof value === 'object') {
        parsed = Object.entries(value).map(([key, val]) => ({
          id: key,
          label: key,
          value: typeof val === 'string' ? val : JSON.stringify(val),
        }));
      }
      setCustomFields(parsed);
    }
  }, [account?.custom_fields]);

  const handleAddCustomField = () => {
    if (!customFieldDraft.label.trim()) {
      toast.error('Label is required');
      return;
    }
    if (customFields.length >= 10) {
      toast.error('Maximum 10 custom fields allowed');
      return;
    }
    setCustomFields((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        label: customFieldDraft.label.trim(),
        value: customFieldDraft.value,
      },
    ]);
    setCustomFieldDraft({ label: '', value: '' });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          accountId: account.account_id || account.id,
          ...formData,
          custom_fields: customFields,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update account');
      }

      toast.success('Account updated successfully');
      onSave();
      onClose();
    } catch (error) {
      toast.error('Failed to update account', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Edit Account</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-1">Account Name *</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2"
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Account Number</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bank Name</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2"
                  value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Account Type</label>
                <select
                  className="w-full border rounded-lg px-3 py-2"
                  value={formData.account_type}
                  onChange={(e) => setFormData({ ...formData, account_type: e.target.value })}
                >
                  <option value="">Select type</option>
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit">Credit</option>
                  <option value="investment">Investment</option>
                  <option value="loan">Loan</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Currency</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                  maxLength={3}
                />
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Bank Details</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-1">IBAN</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2"
                  value={formData.iban}
                  onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">BIC/SWIFT</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2"
                  value={formData.bic}
                  onChange={(e) => setFormData({ ...formData, bic: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Account Holder Name</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2"
                  value={formData.account_holder_name}
                  onChange={(e) => setFormData({ ...formData, account_holder_name: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Internal notes about this account..."
            />
          </div>

          {/* Custom Fields */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Custom Fields</h3>
            
            {customFields.length > 0 && (
              <div className="space-y-2 mb-4">
                {customFields.map((field, index) => (
                  <div key={field.id} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Label"
                      className="flex-1 border rounded-lg px-3 py-2"
                      value={field.label}
                      onChange={(e) => {
                        const copy = [...customFields];
                        copy[index] = { ...copy[index], label: e.target.value };
                        setCustomFields(copy);
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Value"
                      className="flex-1 border rounded-lg px-3 py-2"
                      value={field.value}
                      onChange={(e) => {
                        const copy = [...customFields];
                        copy[index] = { ...copy[index], value: e.target.value };
                        setCustomFields(copy);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCustomFields((prev) => prev.filter((f) => f.id !== field.id))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Label"
                className="flex-1 border rounded-lg px-3 py-2"
                value={customFieldDraft.label}
                onChange={(e) => setCustomFieldDraft({ ...customFieldDraft, label: e.target.value })}
              />
              <input
                type="text"
                placeholder="Value"
                className="flex-1 border rounded-lg px-3 py-2"
                value={customFieldDraft.value}
                onChange={(e) => setCustomFieldDraft({ ...customFieldDraft, value: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddCustomField}
                disabled={customFields.length >= 10}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {customFields.length}/10 custom fields
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t p-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

