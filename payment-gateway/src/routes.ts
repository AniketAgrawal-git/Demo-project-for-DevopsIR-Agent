import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getFault, setFault, resetFault } from './faultState';

const router = Router();

// GET / - Landing page
router.get('/', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Gateway</title>
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
  <h1>&#x1F6E1; Payment Gateway</h1>
  <span class="badge ok">&#x2705; RUNNING on port 4001</span>
  <div class="section">
    <h2>API Endpoints</h2>
    <div class="endpoint"><span class="method post">POST</span><span class="path">/api/charge</span><span class="desc">Process a charge (internal)</span></div>
    <div class="endpoint"><span class="method get">GET</span><a class="path" href="/health">/health</a><span class="desc">Health check</span></div>
    <div class="endpoint"><span class="method get">GET</span><a class="path" href="/admin/fault">/admin/fault</a><span class="desc">Current fault state</span></div>
    <div class="endpoint"><span class="method post">POST</span><span class="path">/admin/fault</span><span class="desc">Inject fault</span></div>
    <div class="endpoint"><span class="method post">POST</span><span class="path">/admin/fault/reset</span><span class="desc">Reset all faults</span></div>
    <div class="endpoint"><span class="method get">GET</span><a class="path" href="/internal/logs">/internal/logs</a><span class="desc">Gateway logs</span></div>
  </div>
</div></body></html>`);
});

// In-memory log store
interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  event: string;
  request_id?: string;
  [key: string]: any;
}

const logs: LogEntry[] = [];
const MAX_LOGS = 5000;

function addLog(entry: LogEntry): void {
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  // Also print to stdout for Docker logs
  console.log(JSON.stringify(entry));
}

// POST /api/charge - main charge endpoint
router.post('/api/charge', async (req: Request, res: Response) => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  const startTime = Date.now();
  const fault = getFault();

  addLog({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'payment-gateway',
    event: 'charge_request_received',
    request_id: requestId,
    amount: req.body?.amount,
    currency: req.body?.currency,
  });

  if (fault.enabled && fault.type === 'UPSTREAM_TIMEOUT') {
    addLog({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      service: 'payment-gateway',
      event: 'artificial_latency_injected',
      request_id: requestId,
      delay_ms: fault.delay_ms,
    });

    // Simulate slow response - use a promise-based delay
    await new Promise<void>((resolve) => setTimeout(resolve, fault.delay_ms));
  } else {
    // Normal processing delay: 100-300ms
    const normalDelay = 100 + Math.floor(Math.random() * 200);
    await new Promise<void>((resolve) => setTimeout(resolve, normalDelay));
  }

  const duration = Date.now() - startTime;
  const transactionId = `mock-txn-${uuidv4().substring(0, 8)}`;

  addLog({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'payment-gateway',
    event: 'charge_completed',
    request_id: requestId,
    transaction_id: transactionId,
    duration_ms: duration,
  });

  res.json({
    status: 'approved',
    transactionId,
  });
});

// POST /admin/fault - inject a fault
router.post('/admin/fault', (req: Request, res: Response) => {
  const { type, enabled } = req.body;

  if (enabled === false) {
    resetFault();
    addLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'payment-gateway',
      event: 'fault_disabled',
    });
    res.json({ message: 'Fault disabled', fault: getFault() });
    return;
  }

  const delay = type === 'UPSTREAM_TIMEOUT' ? 30000 : 0;
  setFault(type || 'UPSTREAM_TIMEOUT', delay);

  addLog({
    timestamp: new Date().toISOString(),
    level: 'WARN',
    service: 'payment-gateway',
    event: 'fault_injected',
    fault_type: type,
    delay_ms: delay,
  });

  res.json({ message: 'Fault injected', fault: getFault() });
});

// POST /admin/fault/reset - reset all faults
router.post('/admin/fault/reset', (_req: Request, res: Response) => {
  resetFault();

  addLog({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'payment-gateway',
    event: 'fault_reset',
  });

  res.json({ message: 'All faults reset', fault: getFault() });
});

// GET /admin/fault - get current fault state
router.get('/admin/fault', (_req: Request, res: Response) => {
  res.json(getFault());
});

// GET /health - health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'payment-gateway',
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// GET /internal/logs - retrieve logs for this gateway
router.get('/internal/logs', (req: Request, res: Response) => {
  const sinceMinutes = parseInt(req.query.since_minutes as string) || 60;
  const limit = parseInt(req.query.limit as string) || 100;
  const cutoff = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();

  const filtered = logs
    .filter((log) => log.timestamp >= cutoff)
    .slice(-limit);

  res.json({
    service: 'payment-gateway',
    log_count: filtered.length,
    logs: filtered,
  });
});

export default router;
