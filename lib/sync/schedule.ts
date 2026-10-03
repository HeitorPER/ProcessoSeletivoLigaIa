import type { SyncMode } from './engine';

export function decideRun(input: { hasRequest: boolean; lastRunAt: number | null; lastFullScanAt: number | null; now: number; incrementalMs: number; fullMs: number }): SyncMode | null {
  if (input.hasRequest) return 'manual';
  if (input.lastRunAt !== null && input.now - input.lastRunAt < input.incrementalMs) return null;
  if (input.lastFullScanAt === null || input.now - input.lastFullScanAt >= input.fullMs) return 'full';
  return 'incremental';
}
