/**
 * Xero Webhook Handler
 *
 * Receives real-time notifications from Xero when data changes.
 * Xero webhooks use HMAC-SHA256 signature validation.
 *
 * Webhook Events:
 * - Bank transactions created/updated
 * - Invoices created/updated/deleted
 * - Contacts created/updated
 * - Payments created/updated
 *
 * @see https://developer.xero.com/documentation/webhooks/overview
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { supabase } from '@/lib/supabase';
import { processXeroWebhookEvent } from '@/lib/services/xero-webhook-service';
import { xeroLogger } from '@/lib/services/xero-observability-service';

// Xero sends a validation request when setting up webhooks
// We must respond with exactly the same payload to confirm subscription
export async function GET(req: NextRequest) {
  // Xero webhook subscription validation
  // Return 200 OK for intent to receive validation
  return new NextResponse('OK', { status: 200 });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Get the raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get('x-xero-signature');

    xeroLogger.info('Received webhook request');

    // Validate signature
    if (!signature) {
      xeroLogger.error('Missing x-xero-signature header');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }

    // Get webhook key from environment
    const webhookKey = process.env.XERO_WEBHOOK_KEY;
    if (!webhookKey) {
      xeroLogger.error('XERO_WEBHOOK_KEY not configured');
      // Return 200 to prevent Xero from retrying (we need to fix config)
      return new NextResponse('OK', { status: 200 });
    }

    // Verify HMAC-SHA256 signature
    const expectedSignature = createHmac('sha256', webhookKey)
      .update(rawBody)
      .digest('base64');

    if (signature !== expectedSignature) {
      xeroLogger.error('Invalid signature', {
        received: signature.substring(0, 20) + '...',
        expected: expectedSignature.substring(0, 20) + '...',
      });
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse the webhook payload
    let payload: XeroWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      xeroLogger.error('Failed to parse payload', { error: parseError });
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    xeroLogger.info('Payload received', {
      events: payload.events?.length || 0,
      firstEventSequence: payload.firstEventSequence,
      lastEventSequence: payload.lastEventSequence,
    });

    // Store webhook event for audit trail
    await storeWebhookEvent(payload, rawBody);

    // Process events asynchronously
    // Return 200 immediately to acknowledge receipt (Xero requires < 5s response)
    processWebhookEventsAsync(payload).catch((error) => {
      xeroLogger.error('Async processing error', { error });
    });

    xeroLogger.info(`Acknowledged in ${Date.now() - startTime}ms`);

    // Xero expects a 200 response to confirm receipt
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    xeroLogger.error('Handler error', { error });
    // Return 200 to prevent retries for unexpected errors
    // Log the error for investigation
    return new NextResponse('OK', { status: 200 });
  }
}

// =====================================================
// Types
// =====================================================

interface XeroWebhookPayload {
  events: XeroWebhookEvent[];
  firstEventSequence: number;
  lastEventSequence: number;
  entropy: string;
}

interface XeroWebhookEvent {
  resourceUrl: string;
  resourceId: string;
  eventDateUtc: string;
  eventType: string;
  eventCategory: string;
  tenantId: string;
  tenantType: string;
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Store webhook event for audit trail and debugging
 */
async function storeWebhookEvent(
  payload: XeroWebhookPayload,
  rawBody: string
): Promise<void> {
  try {
    await supabase.from('webhook_events').insert({
      provider: 'xero',
      event_type: payload.events?.[0]?.eventType || 'unknown',
      payload: payload,
      raw_payload: rawBody,
      received_at: new Date().toISOString(),
      processed: false,
    });
  } catch (error) {
    // Non-critical - log and continue
    xeroLogger.warn('Failed to store event', { error });
  }
}

/**
 * Process webhook events asynchronously
 * This runs after we've acknowledged receipt to Xero
 */
async function processWebhookEventsAsync(
  payload: XeroWebhookPayload
): Promise<void> {
  if (!payload.events || payload.events.length === 0) {
    xeroLogger.info('No events to process');
    return;
  }

  xeroLogger.info(`Processing ${payload.events.length} events...`);

  for (const event of payload.events) {
    try {
      await processXeroWebhookEvent(event);
    } catch (error) {
      xeroLogger.error('Event processing error', {
        eventType: event.eventType,
        resourceId: event.resourceId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  xeroLogger.info('Finished processing events');
}

