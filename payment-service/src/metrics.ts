interface RequestRecord {
  timestamp: number;
  duration_ms: number;
  success: boolean;
}

const records: RequestRecord[] = [];
const MAX_RECORDS = 10000;

export function recordRequest(duration_ms: number, success: boolean): void {
  records.push({
    timestamp: Date.now(),
    duration_ms,
    success,
  });
  if (records.length > MAX_RECORDS) {
    records.splice(0, records.length - MAX_RECORDS);
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function getMetrics() {
  // Use records from the last 5 minutes for current metrics
  const windowMs = 5 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  const recent = records.filter((r) => r.timestamp >= cutoff);

  const requestCount = recent.length;
  const errorCount = recent.filter((r) => !r.success).length;
  const errorRate = requestCount > 0 ? (errorCount / requestCount) * 100 : 0;

  const durations = recent.map((r) => r.duration_ms);
  const sortedDurations = [...durations].sort((a, b) => a - b);

  const avgLatency = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  const p50 = percentile(sortedDurations, 50);
  const p95 = percentile(sortedDurations, 95);
  const p99 = percentile(sortedDurations, 99);

  // Approximate CPU/memory from process
  const memUsage = process.memoryUsage();
  const totalMem = 512 * 1024 * 1024; // assume 512MB container
  const memPercent = parseFloat(((memUsage.rss / totalMem) * 100).toFixed(1));

  // CPU approximation based on active requests and latency
  const cpuBase = 5;
  const cpuLoad = requestCount > 0 ? Math.min(95, cpuBase + (requestCount * 0.5) + (avgLatency > 5000 ? 30 : 0)) : cpuBase;

  return {
    service: 'payment-service',
    window_seconds: windowMs / 1000,
    cpu_percent: parseFloat(cpuLoad.toFixed(1)),
    memory_percent: memPercent,
    request_count: requestCount,
    error_count: errorCount,
    error_rate_percent: parseFloat(errorRate.toFixed(1)),
    avg_latency_ms: avgLatency,
    p50_latency_ms: p50,
    p95_latency_ms: p95,
    p99_latency_ms: p99,
  };
}
