# DevOps Live Demo - Incident Simulation System

A local, production-like microservice environment designed to simulate realistic DevOps incidents for investigation by an external AI incident-response agent.

## Architecture

```
Browser/User → Payment Service (:4000) → Payment Gateway (:4001)
```

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- curl or PowerShell available

### Start the System

```bash
docker compose up --build
```

Wait for both services to be healthy (about 30 seconds).

### A. Check Health

```bash
# Linux/Mac
curl http://localhost:4000/health
curl http://localhost:4001/health
```

```powershell
# Windows PowerShell
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4001/health
```

### B. Send Normal Payment Requests

```bash
# Linux/Mac
curl -X POST http://localhost:4000/api/payment \
  -H "Content-Type: application/json" \
  -d '{"amount": 499, "currency": "INR"}'
```

```powershell
# Windows PowerShell
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/payment `
  -ContentType "application/json" `
  -Body '{"amount": 499, "currency": "INR"}'
```

Send 5-10 requests. Each should return `approved` within ~200-400ms.

### C. Check Normal Metrics

```bash
curl http://localhost:4000/internal/metrics
```

```powershell
Invoke-RestMethod http://localhost:4000/internal/metrics
```

Expected: Low latency, zero errors.

### D. Inject Upstream Timeout Fault

```bash
curl -X POST http://localhost:4001/admin/fault \
  -H "Content-Type: application/json" \
  -d '{"type": "UPSTREAM_TIMEOUT", "enabled": true}'
```

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4001/admin/fault `
  -ContentType "application/json" `
  -Body '{"type": "UPSTREAM_TIMEOUT", "enabled": true}'
```

### E. Generate Incident Traffic

Send 5-10 payment requests (they will timeout after ~10 seconds each):

```bash
for i in $(seq 1 5); do
  curl -X POST http://localhost:4000/api/payment \
    -H "Content-Type: application/json" \
    -d '{"amount": 499, "currency": "INR"}' &
done
wait
```

```powershell
# Windows PowerShell - send 5 requests
1..5 | ForEach-Object {
  Start-Job {
    Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/payment `
      -ContentType "application/json" `
      -Body '{"amount": 499, "currency": "INR"}' `
      -TimeoutSec 30
  }
}
Get-Job | Wait-Job | Receive-Job
Get-Job | Remove-Job
```

### F. Check Alert

```bash
curl http://localhost:4000/internal/alert
```

```powershell
Invoke-RestMethod http://localhost:4000/internal/alert
```

Expected: `HIGH` severity alert with `p99_latency_ms` exceeding threshold.

### G. Check Logs

```bash
# Payment service logs
curl "http://localhost:4000/internal/logs?service=payment-service&since_minutes=15"

# Payment gateway logs (proxied through payment-service)
curl "http://localhost:4000/internal/logs?service=payment-gateway&since_minutes=15"
```

```powershell
Invoke-RestMethod "http://localhost:4000/internal/logs?service=payment-service&since_minutes=15"
Invoke-RestMethod "http://localhost:4000/internal/logs?service=payment-gateway&since_minutes=15"
```

### H. Check Metrics

```bash
curl http://localhost:4000/internal/metrics
```

Expected: High p95/p99 latency, increased error rate.

### I. Check Service Status

```bash
curl http://localhost:4000/internal/service-status
```

### J. Check Deployments

```bash
curl "http://localhost:4000/internal/deployments?service=payment-service"
curl "http://localhost:4000/internal/deployments?service=payment-gateway"
```

### K. Reset Fault

```bash
curl -X POST http://localhost:4001/admin/fault/reset
```

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4001/admin/fault/reset
```

### L. Stop the System

```bash
docker compose down
```

## API Reference

### Payment Service (http://localhost:4000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/payment` | POST | Process a payment (body: `{"amount": 499, "currency": "INR"}`) |
| `/health` | GET | Service health check |
| `/internal/logs` | GET | Retrieve logs (query: `service`, `since_minutes`, `limit`) |
| `/internal/metrics` | GET | Current operational metrics |
| `/internal/deployments` | GET | Deployment history (query: `service`) |
| `/internal/alert` | GET | Active alert status |
| `/internal/service-status` | GET | Service and dependency status |
| `/internal/scenario` | GET | Scenario metadata |

### Payment Gateway (http://localhost:4001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/charge` | POST | Process a charge (internal) |
| `/health` | GET | Service health check |
| `/admin/fault` | GET | Current fault state |
| `/admin/fault` | POST | Inject fault (body: `{"type": "UPSTREAM_TIMEOUT", "enabled": true}`) |
| `/admin/fault/reset` | POST | Reset all faults |
| `/internal/logs` | GET | Gateway logs (query: `since_minutes`, `limit`) |

## External AI Agent Integration

An external DevOps AI agent can investigate incidents through these steps:

1. **Receive Alert**: Poll `GET /internal/alert` — receives symptom-only alert (no root cause)
2. **Check Metrics**: `GET /internal/metrics` — observe latency, error rates
3. **Review Logs**: `GET /internal/logs?service=payment-service` — find timeout errors, correlate request IDs
4. **Check Gateway Logs**: `GET /internal/logs?service=payment-gateway` — discover latency injection evidence
5. **Check Deployments**: `GET /internal/deployments?service=payment-service` — rule out recent deployment
6. **Check Status**: `GET /internal/service-status` — check dependency health
7. **Diagnose**: Correlate evidence to determine root cause
8. **Recommend**: Suggest remediation (do NOT auto-execute)

## Safety

- ✅ Runs entirely locally via Docker
- ✅ No external API keys required
- ✅ No connection to cloud providers
- ✅ No real payment processing
- ✅ No destructive operations
- ✅ Fault injection only affects the local mock gateway
- ✅ All data is ephemeral (in-memory)
