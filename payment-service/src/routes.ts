import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { log, getLogs } from './logger';
import { recordRequest, getMetrics } from './metrics';
import { chargePayment, getGatewayUrl } from './gatewayClient';
import { getGatewayStatus } from './faultState';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// GET / - Landing page
router.get('/', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Service</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:2rem}
  .container{max-width:800px;margin:0 auto}
  h1{font-size:1.8rem;margin-bottom:.5rem;color:#38bdf8}
  .badge{display:inline-block;padding:.25rem .75rem;border-radius:9999px;font-size:.75rem;font-weight:600;margin-bottom:1.5rem}
  .badge.ok{background:#065f46;color:#6ee7b7}
  .section{background:#1e293b;border-radius:.75rem;padding:1.5rem;margin-bottom:1rem;border:1px solid #334155}
  .section h2{font-size:1rem;color:#94a3b8;margin-bottom:1rem;text-transform:uppercase;letter-spacing:.05em}
  .endpoint{display:flex;align-items:center;gap:.75rem;padding:.5rem 0;border-bottom:1px solid #334155}
  .endpoint:last-child{border-bottom:none}
  .method{padding:.2rem .5rem;border-radius:.25rem;font-size:.7rem;font-weight:700;min-width:3.5rem;text-align:center}
  .method.get{background:#065f46;color:#6ee7b7}
  .method.post{background:#7c2d12;color:#fdba74}
  .path{color:#f1f5f9;font-family:monospace;font-size:.9rem}
  .desc{color:#94a3b8;font-size:.8rem;margin-left:auto}
  a{color:#38bdf8;text-decoration:none}
  a:hover{text-decoration:underline}
</style></head><body>
<div class="container">
  <h1>&#x1F4B3; Payment Service</h1>
  <span class="badge ok">&#x2705; RUNNING v2.4.1 on port 4000</span>
  <div class="section">
    <h2>Public API</h2>
    <div class="endpoint"><span class="method post">POST</span><span class="path">/api/payment</span><span class="desc">Process a payment { amount, currency }</span></div>
    <div class="endpoint"><span class="method get">GET</span><a class="path" href="/health">/health</a><span class="desc">Health check</span></div>
  </div>
  <div class="section">
    <h2>Observability APIs</h2>
    <div class="endpoint"><span class="method get">GET</span><a class="path" href="/internal/metrics">/internal/metrics</a><span class="desc">Live operational metrics</span></div>
    <div class="endpoint"><span class="method get">GET</span><a class="path" href="/internal/alert">/internal/alert</a><span class="desc">Active alert status</span></div>
    <div class="endpoint"><span class="method get">GET</span><a class="path" href="/internal/logs?service=payment-service&since_minutes=30">/internal/logs</a><span class="desc">Structured logs</span></div>
    <div class="endpoint"><span class="method get">GET</span><a class="path" href="/internal/service-status">/internal/service-status</a><span class="desc">Dependency status</span></div>
    <div class="endpoint"><span class="method get">GET</span><a class="path" href="/internal/deployments?service=payment-service">/internal/deployments</a><span class="desc">Deployment history</span></div>
    <div class="endpoint"><span class="method get">GET</span><a class="path" href="/internal/scenario">/internal/scenario</a><span class="desc">Scenario metadata</span></div>
  </div>
</div></body></html>`);
});

// POST /api/payment - process a payment
router.post('/api/payment', async (req: Request, res: Response) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  const { amount, currency } = req.body;

  log({
    level: 'INFO',
    event: 'payment_request_received',
    request_id: requestId,
    amount,
    currency,
  });

  if (!amount || !currency) {
    log({
      level: 'WARN',
      event: 'invalid_payment_request',
      request_id: requestId,
      reason: 'missing amount or currency',
    });
    recordRequest(Date.now() - startTime, false);
    res.status(400).json({ error: 'Missing amount or currency', request_id: requestId });
    return;
  }

  const result = await chargePayment(amount, currency, requestId);
  const totalDuration = Date.now() - startTime;

  if (result.success) {
    recordRequest(totalDuration, true);
    log({
      level: 'INFO',
      event: 'payment_completed',
      request_id: requestId,
      transaction_id: result.data?.transactionId,
      duration_ms: totalDuration,
    });
    res.json({
      status: 'approved',
      transactionId: result.data?.transactionId,
      request_id: requestId,
      duration_ms: totalDuration,
    });
  } else {
    recordRequest(totalDuration, false);
    log({
      level: 'ERROR',
      event: 'payment_failed',
      request_id: requestId,
      reason: result.error,
      duration_ms: totalDuration,
    });
    res.status(502).json({
      status: 'failed',
      error: result.error,
      request_id: requestId,
      duration_ms: totalDuration,
    });
  }
});

// GET /health
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'payment-service',
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// GET /internal/logs
router.get('/internal/logs', (req: Request, res: Response) => {
  const service = (req.query.service as string) || 'payment-service';
  const sinceMinutes = parseInt(req.query.since_minutes as string) || 60;
  const limit = parseInt(req.query.limit as string) || 100;

  if (service === 'payment-gateway') {
    // Proxy the request to the gateway
    const gatewayUrl = getGatewayUrl();
    fetch(`${gatewayUrl}/internal/logs?since_minutes=${sinceMinutes}&limit=${limit}`)
      .then((r) => r.json())
      .then((data) => res.json(data))
      .catch((err) => {
        res.status(502).json({
          service: 'payment-gateway',
          error: `Cannot reach gateway: ${err.message}`,
          logs: [],
        });
      });
    return;
  }

  const logs = getLogs(sinceMinutes, limit);
  res.json({
    service: 'payment-service',
    log_count: logs.length,
    logs,
  });
});

// GET /internal/metrics
router.get('/internal/metrics', (_req: Request, res: Response) => {
  res.json(getMetrics());
});

// GET /internal/deployments
router.get('/internal/deployments', (req: Request, res: Response) => {
  const service = (req.query.service as string) || 'payment-service';

  try {
    // Try multiple paths for the deployment data
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'deployment-data', 'deployments.json'),
      path.join(__dirname, '..', 'deployment-data', 'deployments.json'),
      '/app/deployment-data/deployments.json',
    ];

    let data: any = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        break;
      }
    }

    if (!data) {
      res.status(404).json({ error: 'Deployment data not found' });
      return;
    }

    const serviceDeployments = data.deployments?.filter(
      (d: any) => d.service === service
    ) || [];

    res.json({
      service,
      deployments: serviceDeployments,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /internal/alert
router.get('/internal/alert', (_req: Request, res: Response) => {
  const metrics = getMetrics();
  const P99_THRESHOLD = 2000;
  const ERROR_RATE_THRESHOLD = 10;

  const alerts: any[] = [];

  if (metrics.p99_latency_ms > P99_THRESHOLD && metrics.request_count > 0) {
    alerts.push({
      active: true,
      severity: 'HIGH',
      service: 'payment-service',
      metric: 'p99_latency_ms',
      value: metrics.p99_latency_ms,
      threshold: P99_THRESHOLD,
      message: 'Payment service p99 latency exceeded threshold',
    });
  }

  if (metrics.error_rate_percent > ERROR_RATE_THRESHOLD && metrics.request_count > 0) {
    alerts.push({
      active: true,
      severity: 'HIGH',
      service: 'payment-service',
      metric: 'error_rate_percent',
      value: metrics.error_rate_percent,
      threshold: ERROR_RATE_THRESHOLD,
      message: 'Payment service error rate exceeded threshold',
    });
  }

  if (alerts.length === 0) {
    res.json({
      active: false,
      severity: 'LOW',
      service: 'payment-service',
      message: 'All metrics within normal range',
    });
    return;
  }

  // Return the highest severity alert
  res.json(alerts[0]);
});

// GET /internal/service-status
router.get('/internal/service-status', (_req: Request, res: Response) => {
  const gwStatus = getGatewayStatus();
  res.json({
    service: 'payment-service',
    gateway_reachable: gwStatus.reachable,
    gateway_url: getGatewayUrl(),
    gateway_consecutive_failures: gwStatus.consecutiveFailures,
    gateway_last_check: gwStatus.lastCheckTime,
    gateway_last_error: gwStatus.lastError,
    active_fault: false, // payment-service doesn't know about gateway faults
  });
});

// GET /internal/scenario
router.get('/internal/scenario', (_req: Request, res: Response) => {
  res.json({
    scenario_id: 'live_upstream_dependency_failure',
    category: 'upstream_dependency_failure',
    service: 'payment-service',
    description: 'Payment service latency increased due to an upstream gateway problem',
  });
});

export default router;
