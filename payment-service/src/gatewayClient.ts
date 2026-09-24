import { log } from './logger';
import { updateGatewayStatus } from './faultState';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4001';
const GATEWAY_TIMEOUT_MS = 10000; // 10 second timeout

export interface ChargeResult {
  success: boolean;
  data?: {
    status: string;
    transactionId: string;
  };
  error?: string;
  duration_ms: number;
}

export function getGatewayUrl(): string {
  return GATEWAY_URL;
}

export async function chargePayment(
  amount: number,
  currency: string,
  requestId: string
): Promise<ChargeResult> {
  const startTime = Date.now();

  log({
    level: 'INFO',
    event: 'gateway_request_started',
    request_id: requestId,
    gateway_url: `${GATEWAY_URL}/api/charge`,
    amount,
    currency,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

    const response = await fetch(`${GATEWAY_URL}/api/charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      body: JSON.stringify({ amount, currency }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      updateGatewayStatus(false, `HTTP ${response.status}`);

      log({
        level: 'ERROR',
        event: 'gateway_error_response',
        request_id: requestId,
        status_code: response.status,
        duration_ms: duration,
        error: errorText,
      });

      return { success: false, error: `Gateway returned ${response.status}`, duration_ms: duration };
    }

    const data = (await response.json()) as { status: string; transactionId: string };
    updateGatewayStatus(true);

    log({
      level: 'INFO',
      event: 'gateway_response_received',
      request_id: requestId,
      transaction_id: data.transactionId,
      duration_ms: duration,
    });

    return { success: true, data, duration_ms: duration };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    updateGatewayStatus(false, err.message);

    if (err.name === 'AbortError') {
      log({
        level: 'ERROR',
        event: 'upstream_timeout',
        request_id: requestId,
        dependency: 'payment-gateway',
        timeout_ms: GATEWAY_TIMEOUT_MS,
        duration_ms: duration,
      });
      return { success: false, error: 'UPSTREAM_TIMEOUT', duration_ms: duration };
    }

    log({
      level: 'ERROR',
      event: 'gateway_connection_error',
      request_id: requestId,
      dependency: 'payment-gateway',
      error: err.message,
      duration_ms: duration,
    });

    return { success: false, error: err.message, duration_ms: duration };
  }
}
