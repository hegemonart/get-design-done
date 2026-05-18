// scripts/lib/gsd-health-mirror/index.d.cts — TypeScript ambient declarations
// for the gsd-health-mirror CJS module. Plan 27.7-02.

export interface HealthCheck {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export interface HealthChecksResult {
  checks: HealthCheck[];
}

export function getHealthChecks(rootDir: string): Promise<HealthChecksResult>;
