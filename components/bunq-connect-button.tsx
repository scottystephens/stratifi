// Bunq Connect Button Component
// Handles the OAuth flow initiation for Bunq banking connection

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface BunqConnectButtonProps {
  tenantId: string;
  connectionName?: string;
  accountId?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function BunqConnectButton({
  tenantId,
  connectionName = 'Bunq Banking Connection',
  accountId,
  onSuccess,
  onError,
}: BunqConnectButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  async function handleConnect() {
    try {
      setIsConnecting(true);

      // Debug: Log what we're sending
      console.log('🔵 Bunq Connect - Request Data:', {
        tenantId,
        connectionName,
        accountId,
      });

      // Call the authorize API to create connection and get OAuth URL
      const response = await fetch('/api/connections/bunq/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          connectionName,
          accountId,
        }),
      });

      const data = await response.json();

      // Debug: Log the response
      console.log('🔵 Bunq Connect - API Response:', {
        status: response.status,
        ok: response.ok,
        data,
      });

      if (!response.ok || !data.success) {
        // Show detailed error information for debugging
        const errorDetails = [
          `Status: ${response.status}`,
          `Error: ${data.error || 'Unknown error'}`,
          data.details ? `Details: ${data.details}` : null,
          data.debug ? `Debug: ${JSON.stringify(data.debug)}` : null,
        ].filter(Boolean).join('\n');
        
        console.error('🔴 Bunq Connect - Error Details:', errorDetails);
        throw new Error(errorDetails);
      }

      // Debug: Success
      console.log('✅ Bunq Connect - Success! Redirecting to:', data.authorizationUrl);

      // Redirect to Bunq OAuth page
      window.location.href = data.authorizationUrl;
    } catch (error) {
      console.error('Bunq connection error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to connect to Bunq';
      
      // Show detailed error in alert for debugging
      const debugMessage = `Bunq Connection Error:\n\n${errorMessage}\n\nPlease check:\n1. Are you logged in?\n2. Do you have an organization selected?\n3. Check browser console (F12) for more details`;
      
      if (onError) {
        onError(errorMessage);
      } else {
        alert(debugMessage);
      }
      
      setIsConnecting(false);
    }
  }

  return (
    <Button
      onClick={handleConnect}
      disabled={isConnecting}
      className="w-full"
    >
      {isConnecting ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Connecting to Bunq...
        </>
      ) : (
        <>Connect with Bunq</>
      )}
    </Button>
  );
}

