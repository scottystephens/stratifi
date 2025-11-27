'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  KeyRound,
  Loader2,
  Lock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DirectBankProviderConfig } from '@/lib/direct-bank-providers';

interface DirectBankApiCardProps {
  tenantId: string;
}

export function DirectBankApiCard({ tenantId }: DirectBankApiCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [providers, setProviders] = useState<DirectBankProviderConfig[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [environment, setEnvironment] = useState('sandbox');
  const [notes, setNotes] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadProviders() {
      try {
        setLoadingProviders(true);
        const response = await fetch('/api/direct-banks/providers');
        const data = await response.json();
        if (data.success && Array.isArray(data.providers) && data.providers.length > 0) {
          setProviders(data.providers);
          setSelectedProviderId(data.providers[0].id);
          setConnectionName(data.providers[0].defaultConnectionName);
          setEnvironment(data.providers[0].environmentOptions[0]?.value || 'sandbox');
        } else {
          setProviders([]);
        }
      } catch (error) {
        console.error('Failed to load direct bank providers:', error);
        setProviders([]);
      } finally {
        setLoadingProviders(false);
      }
    }

    loadProviders();
  }, []);

  const selectedProvider: DirectBankProviderConfig | undefined = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId),
    [providers, selectedProviderId]
  );

  useEffect(() => {
    if (selectedProvider) {
      setConnectionName(selectedProvider.defaultConnectionName);
      setEnvironment(selectedProvider.environmentOptions[0]?.value || 'sandbox');
      setFieldValues({});
      setVisibleSecrets({});
      setError(null);
      setSuccess(null);
    }
  }, [selectedProviderId, selectedProvider]);

  if (!selectedProvider && !loadingProviders) {
    return (
      <Card className="border-2 border-dashed p-6">
        <h3 className="text-lg font-semibold">Direct Bank APIs</h3>
        <p className="text-sm text-muted-foreground mt-2">
          No direct bank providers are available yet. Contact Stratiri support to enable
          closed beta access.
        </p>
      </Card>
    );
  }

  const requiredFieldsMissing = selectedProvider
    ? selectedProvider.credentialFields.some(
        (field) => field.required && !fieldValues[field.key]
      )
    : true;

  const isDisabled = !tenantId || !selectedProvider || requiredFieldsMissing || !connectionName;

  function handleFieldChange(fieldKey: string, value: string) {
    setFieldValues((prev) => ({
      ...prev,
      [fieldKey]: value,
    }));
  }

  function toggleSecret(fieldKey: string) {
    setVisibleSecrets((prev) => ({
      ...prev,
      [fieldKey]: !prev[fieldKey],
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDisabled) return;

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      const credentials = selectedProvider.credentialFields.reduce<Record<string, string>>(
        (acc, field) => {
          const value = fieldValues[field.key];
          if (value) {
            acc[field.key] = value;
          }
          return acc;
        },
        {}
      );

      const response = await fetch('/api/banking/standard-bank/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          providerId: selectedProvider.id,
          connectionName,
          environment,
          notes: notes || undefined,
          credentials,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to store credentials');
      }

      setSuccess('Credentials stored securely. Redirecting to connection...');
      setTimeout(() => {
        router.push(`/connections/${data.connectionId}?provider=${selectedProvider.id}`);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store credentials');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border-2 border-dashed p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-blue-600" />
            <h3 className="text-xl font-semibold">Direct Bank APIs</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Closed beta credential capture for direct integrations. Use this for banks that
            are not yet supported by Plaid or Tink.
          </p>
        </div>
        <Button variant="outline" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? (
            <>
              <ChevronUp className="mr-2 h-4 w-4" />
              Hide form
            </>
          ) : (
            <>
              <ChevronDown className="mr-2 h-4 w-4" />
              Add direct bank
            </>
          )}
        </Button>
      </div>

      {expanded && loadingProviders && (
        <p className="mt-4 text-sm text-muted-foreground">Loading providers…</p>
      )}

      {expanded && !loadingProviders && selectedProvider && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Direct provider</label>
              <select
                value={selectedProviderId}
                onChange={(event) => setSelectedProviderId(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  disabled={loadingProviders || providers.length === 0}
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.shortName}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Currently supporting Standard Bank South Africa. More direct APIs coming soon.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedProvider.badge && (
                <Badge variant="secondary">{selectedProvider.badge}</Badge>
              )}
              <a
                href={selectedProvider.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-blue-600 underline"
              >
                Provider documentation
              </a>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Connection name</label>
              <input
                type="text"
                value={connectionName}
                onChange={(event) => setConnectionName(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder={selectedProvider.defaultConnectionName}
                required
              />
            </div>
              <div className="flex items-center gap-3">
              <label className="block text-sm font-medium mb-1">Environment</label>
              <select
                value={environment}
                onChange={(event) => setEnvironment(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                {selectedProvider.environmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {selectedProvider.description}{' '}
            <span className="text-green-700">
              {selectedProvider.instructions ||
                'Credentials stay encrypted at rest (AES-256-GCM).'}
            </span>
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {selectedProvider.credentialFields.map((field) => {
              const isSecret = field.type === 'password';
              const value = fieldValues[field.key] || '';

              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                    {field.label}
                    {isSecret && (
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => toggleSecret(field.key)}
                      >
                        {visibleSecrets[field.key] ? 'Hide' : 'Show'}
                      </button>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type={
                        isSecret && !visibleSecrets[field.key]
                          ? 'password'
                          : field.type === 'password'
                          ? 'text'
                          : 'text'
                      }
                      value={value}
                      onChange={(event) => handleFieldChange(field.key, event.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 pr-10"
                      placeholder={field.placeholder}
                      required={field.required}
                    />
                    {isSecret && (
                      <Lock className="h-4 w-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                  {(field.helperText || field.doc) && (
                    <div className="text-xs text-muted-foreground mt-1 space-y-1">
                      {field.helperText && <p>{field.helperText}</p>}
                      {field.doc?.doc_url && (
                        <a
                          href={field.doc.doc_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 underline block"
                        >
                          {field.doc.doc_label || 'Provider documentation'}
                        </a>
                      )}
                      {field.doc?.instructions && <p>{field.doc.instructions}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="Any implementation context to share with Stratiri"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" disabled={isDisabled || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Securing credentials...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Share Credentials Securely
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              AES-256-GCM encryption with tenant-scoped access controls
            </p>
          </div>
        </form>
      )}
    </Card>
  );
}

