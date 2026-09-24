export interface GatewayStatus {
  reachable: boolean;
  lastCheckTime: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

const gatewayStatus: GatewayStatus = {
  reachable: true,
  lastCheckTime: null,
  lastError: null,
  consecutiveFailures: 0,
};

export function updateGatewayStatus(reachable: boolean, error?: string): void {
  gatewayStatus.reachable = reachable;
  gatewayStatus.lastCheckTime = new Date().toISOString();
  if (reachable) {
    gatewayStatus.lastError = null;
    gatewayStatus.consecutiveFailures = 0;
  } else {
    gatewayStatus.lastError = error || 'unknown';
    gatewayStatus.consecutiveFailures++;
  }
}

export function getGatewayStatus(): GatewayStatus {
  return { ...gatewayStatus };
}
