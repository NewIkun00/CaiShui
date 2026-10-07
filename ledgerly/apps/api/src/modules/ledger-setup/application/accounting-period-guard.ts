import { ConflictException } from '@nestjs/common';
import type { SavedLedgerSetup } from './ledger-setup-store.js';

export function assertAccountingPeriodOpen(setup: SavedLedgerSetup): void {
  if (setup.periodStatus === 'locked') {
    throw new ConflictException({
      code: 'ACCOUNTING_PERIOD_LOCKED',
      message: 'The accounting period is locked',
      details: { periodStart: setup.periodStart, periodEnd: setup.periodEnd },
    });
  }
}
