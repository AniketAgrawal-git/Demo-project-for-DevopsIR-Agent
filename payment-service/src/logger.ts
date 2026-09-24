export interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  event: string;
  request_id?: string;
  [key: string]: any;
}

const logs: LogEntry[] = [];
const MAX_LOGS = 10000;

export function log(entry: Omit<LogEntry, 'timestamp' | 'service'>): void {
  const fullEntry = Object.assign(
    { timestamp: new Date().toISOString(), service: 'payment-service' },
    entry,
  ) as LogEntry;
  logs.push(fullEntry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  console.log(JSON.stringify(fullEntry));
}

export function getLogs(sinceMinutes: number = 60, limit: number = 100): LogEntry[] {
  const cutoff = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
  return logs
    .filter((l) => l.timestamp >= cutoff)
    .slice(-limit);
}
