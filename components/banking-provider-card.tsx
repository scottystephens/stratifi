// Generic Banking Provider Card Component
// Dynamically displays available banking providers

'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Building2 } from 'lucide-react';

interface BankingProvider {
  id: string;
  displayName: string;
  logo?: string;
  color: string;
  description: string;
  authType: 'oauth' | 'api_key' | 'open_banking';
  supportsSync: boolean;
  supportedCountries: string[];
  website: string;
}

interface BankingProviderCardProps {
  provider: BankingProvider;
  tenantId: string;
  connectionName?: string;
  accountId?: string;
  onConnect?: () => void;
  onError?: (error: string) => void;
}

export function BankingProviderCard({
  provider,
  tenantId,
  connectionName,
  accountId,
  onConnect,
  onError,
}: BankingProviderCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  async function handleConnect() {
    try {
      setIsConnecting(true);

      // Call the generic authorize API
      const response = await fetch(`/api/banking/${provider.id}/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          connectionName: connectionName || `${provider.displayName} Connection`,
          accountId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Failed to connect to ${provider.displayName}`);
      }

      // Standard OAuth 2.0 redirect flow - no workarounds
      // This is the industry-standard approach for all OAuth providers
      window.location.href = data.authorizationUrl;
    } catch (error) {
      console.error('Provider connection error:', error);
      const errorMessage =
        error instanceof Error ? error.message : `Failed to connect to ${provider.displayName}`;

      if (onError) {
        onError(errorMessage);
      } else {
        alert(`Error: ${errorMessage}`);
      }

      setIsConnecting(false);
    }
  }

  return (
    <Card
      className="p-6 hover:shadow-lg transition-shadow border-2 hover:border-blue-500"
      style={{ borderColor: isConnecting ? provider.color : undefined }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: `${provider.color}20` }}
          >
            {provider.logo ? (
              <img
                src={provider.logo}
                alt={provider.displayName}
                className="h-8 w-8"
              />
            ) : (
              <Building2
                className="h-8 w-8"
                style={{ color: provider.color }}
              />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{provider.displayName}</h3>
            <Badge variant="secondary" className="text-xs">
              {provider.authType.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-4 flex-1">
          {provider.description}
        </p>

        {/* Features */}
        <div className="space-y-2 mb-4">
          {provider.supportsSync && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-green-600">✓</span>
              <span>Automatic sync</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-green-600">✓</span>
            <span>Supports {provider.supportedCountries.length} countries</span>
          </div>
        </div>

        {/* Connect Button */}
        <Button
          onClick={handleConnect}
          disabled={isConnecting}
          className="w-full"
          style={{
            backgroundColor: isConnecting ? undefined : provider.color,
            borderColor: provider.color,
          }}
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            `Connect ${provider.displayName}`
          )}
        </Button>

        {/* Link */}
        <a
          href={provider.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-center text-muted-foreground hover:underline mt-2"
        >
          Learn more →
        </a>
      </div>
    </Card>
  );
}

