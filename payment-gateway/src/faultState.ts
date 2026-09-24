export interface FaultConfig {
  enabled: boolean;
  type: string | null;
  delay_ms: number;
}

let currentFault: FaultConfig = {
  enabled: false,
  type: null,
  delay_ms: 0,
};

export function getFault(): FaultConfig {
  return { ...currentFault };
}

export function setFault(type: string, delay_ms: number): void {
  currentFault = {
    enabled: true,
    type,
    delay_ms,
  };
}

export function resetFault(): void {
  currentFault = {
    enabled: false,
    type: null,
    delay_ms: 0,
  };
}
