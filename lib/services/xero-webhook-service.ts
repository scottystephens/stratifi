/**
 * Xero Webhook Service
 *
 * Processes webhook events from Xero and triggers appropriate actions.
 * Supports incremental sync based on webhook notifications.
 */

import { supabase } from '@/lib/supabase';
import { getProvider } from '@/lib/banking-providers/provider-registry';
import { orchestrateSync } from './sync-orchestrator';
import { tokenRefreshService } from './token-refresh-service';

// =====================================================
// Types
// =====================================================

export interface XeroWebhookEvent {
  resourceUrl: string;
  resourceId: string;
  eventDateUtc: string;
  eventType: string;
  eventCategory: string;
  tenantId: string; // This is the Xero Tenant ID (organization)
  tenantType: string;
}

export interface WebhookProcessingResult {
  success: boolean;
  action: 'sync_triggered' | 'ignored' | 'error';
  message: string;
  connectionId?: string;
}

// Event categories we care about
const SUPPORTED_EVENT_CATEGORIES = [
  'BANKTRANSACTION',
  'INVOICE',
  'PAYMENT',
  'CONTACT',
  'ACCOUNT',
];

// Event types we process
const SUPPORTED_EVENT_TYPES = ['CREATE', 'UPDATE', 'DELETE'];

// =====================================================
// Main Processing Function
// =====================================================

/**
 * Process a single Xero webhook event
 */
export async function processXeroWebhookEvent(
  event: XeroWebhookEvent
): Promise<WebhookProcessingResult> {
  console.log('[XeroWebhook] Processing event:', {
    category: event.eventCategory,
    type: event.eventType,
    resourceId: event.resourceId,
    xeroTenantId: event.tenantId,
  });

  // Check if we support this event type
  if (!SUPPORTED_EVENT_CATEGORIES.includes(event.eventCategory)) {
    console.log(`[XeroWebhook] Ignoring unsupported category: ${event.eventCategory}`);
    return {
      success: true,
      action: 'ignored',
      message: `Unsupported event category: ${event.eventCategory}`,
    };
  }

  if (!SUPPORTED_EVENT_TYPES.includes(event.eventType)) {
    console.log(`[XeroWebhook] Ignoring unsupported type: ${event.eventType}`);
    return {
      success: true,
      action: 'ignored',
      message: `Unsupported event type: ${event.eventType}`,
    };
  }

  try {
    // Find the connection for this Xero tenant
    const connection = await findConnectionByXeroTenantId(event.tenantId);

    if (!connection) {
      console.log(`[XeroWebhook] No connection found for Xero tenant: ${event.tenantId}`);
      return {
        success: true,
        action: 'ignored',
        message: `No connection found for Xero tenant: ${event.tenantId}`,
      };
    }

    // Check if connection is active
    if (connection.status !== 'active') {
      console.log(`[XeroWebhook] Connection ${connection.id} is not active`);
      return {
        success: true,
        action: 'ignored',
        message: `Connection is not active: ${connection.status}`,
        connectionId: connection.id,
      };
    }

    // Determine what to sync based on event category
    const syncConfig = getSyncConfigForEvent(event);

    // Trigger incremental sync
    await triggerIncrementalSync(connection, event, syncConfig);

    // Update webhook event as processed
    await markWebhookEventProcessed(event);

    return {
      success: true,
      action: 'sync_triggered',
      message: `Triggered ${syncConfig.type} sync for ${event.eventCategory}`,
      connectionId: connection.id,
    };
  } catch (error) {
    console.error('[XeroWebhook] Processing error:', error);
    return {
      success: false,
      action: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Find connection by Xero Tenant ID
 * The Xero Tenant ID is stored in provider_tokens.provider_metadata
 */
async function findConnectionByXeroTenantId(
  xeroTenantId: string
): Promise<{
  id: string;
  tenant_id: string;
  status: string;
  provider: string;
} | null> {
  // First, find the token with this Xero tenant ID
  const { data: tokenData, error: tokenError } = await supabase
    .from('provider_tokens')
    .select('connection_id')
    .eq('provider_id', 'xero')
    .eq('status', 'active')
    .contains('provider_metadata', { xeroTenantId })
    .limit(1)
    .maybeSingle();

  if (tokenError || !tokenData) {
    // Try alternative: check provider_metadata.xero_tenant_id
    const { data: altTokenData } = await supabase
      .from('provider_tokens')
      .select('connection_id')
      .eq('provider_id', 'xero')
      .eq('status', 'active')
      .contains('provider_metadata', { xero_tenant_id: xeroTenantId })
      .limit(1)
      .maybeSingle();

    if (!altTokenData) {
      return null;
    }

    // Get connection details
    const { data: connection } = await supabase
      .from('connections')
      .select('id, tenant_id, status, provider')
      .eq('id', altTokenData.connection_id)
      .single();

    return connection;
  }

  // Get connection details
  const { data: connection } = await supabase
    .from('connections')
    .select('id, tenant_id, status, provider')
    .eq('id', tokenData.connection_id)
    .single();

  return connection;
}

/**
 * Determine sync configuration based on event category
 */
function getSyncConfigForEvent(event: XeroWebhookEvent): {
  type: string;
  syncAccounts: boolean;
  syncTransactions: boolean;
  modifiedSince?: string;
} {
  // Use event date as the modifiedSince for incremental sync
  const modifiedSince = event.eventDateUtc;

  switch (event.eventCategory) {
    case 'BANKTRANSACTION':
      return {
        type: 'transactions',
        syncAccounts: false,
        syncTransactions: true,
        modifiedSince,
      };

    case 'ACCOUNT':
      return {
        type: 'accounts',
        syncAccounts: true,
        syncTransactions: false,
        modifiedSince,
      };

    case 'INVOICE':
    case 'PAYMENT':
      // For invoices/payments, sync transactions as they may affect bank reconciliation
      return {
        type: 'transactions',
        syncAccounts: false,
        syncTransactions: true,
        modifiedSince,
      };

    case 'CONTACT':
      // Contacts don't directly affect our data, but log for future use
      return {
        type: 'contacts',
        syncAccounts: false,
        syncTransactions: false,
      };

    default:
      return {
        type: 'full',
        syncAccounts: true,
        syncTransactions: true,
        modifiedSince,
      };
  }
}

/**
 * Trigger an incremental sync for a connection
 */
async function triggerIncrementalSync(
  connection: { id: string; tenant_id: string; provider: string },
  event: XeroWebhookEvent,
  syncConfig: ReturnType<typeof getSyncConfigForEvent>
): Promise<void> {
  // Skip if nothing to sync
  if (!syncConfig.syncAccounts && !syncConfig.syncTransactions) {
    console.log('[XeroWebhook] No sync needed for event category');
    return;
  }

  // Get token for this connection
  const tokenResult = await tokenRefreshService.getValidAccessToken(
    connection.id,
    'xero',
    async (refreshToken) => {
      const provider = getProvider('xero');
      return provider.refreshAccessToken(refreshToken);
    }
  );

  if (!tokenResult.success || !tokenResult.tokens) {
    throw new Error(`Failed to get valid token: ${tokenResult.error}`);
  }

  // Get Xero tenant ID from token metadata
  const tokenRecord = await tokenRefreshService.getTokenRecord(connection.id, 'xero');
  const xeroTenantId =
    tokenRecord?.provider_metadata?.xeroTenantId ||
    tokenRecord?.provider_metadata?.xero_tenant_id ||
    event.tenantId;

  // Build credentials
  const credentials = {
    connectionId: connection.id,
    tenantId: connection.tenant_id,
    tokens: tokenResult.tokens,
    metadata: { xeroTenantId },
  };

  // Get provider
  const provider = getProvider('xero');

  console.log('[XeroWebhook] Triggering incremental sync:', {
    connectionId: connection.id,
    syncAccounts: syncConfig.syncAccounts,
    syncTransactions: syncConfig.syncTransactions,
    modifiedSince: syncConfig.modifiedSince,
  });

  // Trigger sync with modifiedSince for incremental update
  const result = await orchestrateSync({
    provider,
    connectionId: connection.id,
    tenantId: connection.tenant_id,
    credentials,
    syncAccounts: syncConfig.syncAccounts,
    syncTransactions: syncConfig.syncTransactions,
    userId: 'webhook', // System-triggered sync
    modifiedSince: syncConfig.modifiedSince,
  });

  console.log('[XeroWebhook] Sync completed:', {
    success: result.success,
    accountsSynced: result.accountsSynced,
    transactionsSynced: result.transactionsSynced,
    duration: result.duration,
  });

  if (!result.success && result.errors.length > 0) {
    console.error('[XeroWebhook] Sync errors:', result.errors);
  }
}

/**
 * Mark webhook event as processed in database
 */
async function markWebhookEventProcessed(event: XeroWebhookEvent): Promise<void> {
  try {
    await supabase
      .from('webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq('provider', 'xero')
      .contains('payload', { events: [{ resourceId: event.resourceId }] });
  } catch (error) {
    // Non-critical
    console.warn('[XeroWebhook] Failed to mark event processed:', error);
  }
}

// =====================================================
// Webhook Management Functions
// =====================================================

/**
 * Register a webhook subscription with Xero
 * This should be called during app setup
 */
export async function registerXeroWebhook(
  accessToken: string,
  webhookUrl: string
): Promise<{ success: boolean; webhookId?: string; error?: string }> {
  try {
    const response = await fetch('https://api.xero.com/webhooks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: [
          { type: 'BANKTRANSACTION', status: 'ALL' },
          { type: 'INVOICE', status: 'ALL' },
          { type: 'PAYMENT', status: 'ALL' },
          { type: 'ACCOUNT', status: 'ALL' },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to register webhook: ${response.status} ${errorText}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      webhookId: data.webhookId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get webhook subscription status
 */
export async function getXeroWebhookStatus(
  accessToken: string,
  webhookId: string
): Promise<{
  active: boolean;
  url?: string;
  events?: string[];
  error?: string;
}> {
  try {
    const response = await fetch(`https://api.xero.com/webhooks/${webhookId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return { active: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      active: data.status === 'ACTIVE',
      url: data.url,
      events: data.events?.map((e: any) => e.type),
    };
  } catch (error) {
    return {
      active: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete a webhook subscription
 */
export async function deleteXeroWebhook(
  accessToken: string,
  webhookId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`https://api.xero.com/webhooks/${webhookId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return { success: response.ok };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

