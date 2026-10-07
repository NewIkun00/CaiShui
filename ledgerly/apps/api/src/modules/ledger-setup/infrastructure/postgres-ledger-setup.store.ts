import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { createOpeningBalanceEntries } from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import {
  accountingPeriods,
  auditEvents,
  financialAccounts,
  ledgerInitializations,
  openingBalanceEntries,
  openingBalances,
  outboxEvents,
} from '../../../infrastructure/database/schema.js';
import type {
  LedgerSetupStore,
  SavedLedgerSetup,
  SaveLedgerSetupRecord,
} from '../application/ledger-setup-store.js';

@Injectable()
export class PostgresLedgerSetupStore implements LedgerSetupStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(record: SaveLedgerSetupRecord): Promise<SavedLedgerSetup> {
    await this.db.transaction(async (tx) => {
      await tx.insert(financialAccounts).values({
        id: record.accountId, tenantId: record.tenantId, companyId: record.companyId,
        name: record.setup.accountName, accountType: record.setup.accountType,
        bankName: record.setup.bankName ?? null,
        accountNumberLast4: record.setup.accountNumberLast4 ?? null,
        createdAt: record.createdAt, createdBy: record.actorId,
        updatedAt: record.createdAt, updatedBy: record.actorId,
      });
      await tx.insert(accountingPeriods).values({
        id: record.periodId, tenantId: record.tenantId, companyId: record.companyId,
        periodStart: record.setup.period.start, periodEnd: record.setup.period.end,
        createdAt: record.createdAt, createdBy: record.actorId,
        updatedAt: record.createdAt, updatedBy: record.actorId,
      });
      await tx.insert(openingBalances).values({
        id: record.openingBalanceId, tenantId: record.tenantId, companyId: record.companyId,
        accountId: record.accountId, amount: record.setup.openingBalance.toString(),source:record.setup.openingBalanceSource,
        balanceAsOf: record.setup.openingBalanceAsOf,
        createdAt: record.createdAt, createdBy: record.actorId,
        updatedAt: record.createdAt, updatedBy: record.actorId,
      });
      const openingEntries=createOpeningBalanceEntries(record.setup);
      if(openingEntries.length>0)await tx.insert(openingBalanceEntries).values(openingEntries.map((entry,index)=>({id:record.openingEntryIds[index]!,openingBalanceId:record.openingBalanceId,lineNumber:entry.lineNumber,accountCode:entry.accountCode,accountName:entry.accountName,side:entry.side,amount:entry.amount.toString()})));
      await tx.insert(ledgerInitializations).values({
        id: record.id, tenantId: record.tenantId, companyId: record.companyId,
        accountId: record.accountId, periodId: record.periodId,
        openingBalanceId: record.openingBalanceId,
        createdAt: record.createdAt, createdBy: record.actorId,
        updatedAt: record.createdAt, updatedBy: record.actorId,
      });
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.tenantId, actorId: record.actorId,
        action: 'ledger.setup.create', resourceType: 'company', resourceId: record.companyId,
        outcome: 'success', traceId: record.traceId,
        metadata: { accountType: record.setup.accountType, periodStart: record.setup.period.start },
      });
      await tx.insert(outboxEvents).values({
        id: randomUUID(), tenantId: record.tenantId, eventType: 'ledger.setup.created.v1',
        aggregateType: 'company', aggregateId: record.companyId,
        payload: { ledgerSetupId: record.id, accountId: record.accountId, periodId: record.periodId },
        occurredAt: record.createdAt,
      });
    });
    return this.present(record);
  }

  async find(tenantId: string, companyId: string): Promise<SavedLedgerSetup | null> {
    const [row] = await this.db.select({
      id: ledgerInitializations.id, companyId: ledgerInitializations.companyId,
      periodId: accountingPeriods.id, periodStatus: accountingPeriods.status,
      accountId: financialAccounts.id, accountName: financialAccounts.name,
      accountType: financialAccounts.accountType, bankName: financialAccounts.bankName,
      accountNumberLast4: financialAccounts.accountNumberLast4,
      openingBalance: openingBalances.amount, openingBalanceAsOf: openingBalances.balanceAsOf,
      openingBalanceId:openingBalances.id,openingBalanceSource:openingBalances.source,
      periodStart: accountingPeriods.periodStart, periodEnd: accountingPeriods.periodEnd,
      createdAt: ledgerInitializations.createdAt,
    }).from(ledgerInitializations)
      .innerJoin(financialAccounts, eq(financialAccounts.id, ledgerInitializations.accountId))
      .innerJoin(openingBalances, eq(openingBalances.id, ledgerInitializations.openingBalanceId))
      .innerJoin(accountingPeriods, eq(accountingPeriods.id, ledgerInitializations.periodId))
      .where(and(eq(ledgerInitializations.tenantId, tenantId), eq(ledgerInitializations.companyId, companyId)))
      .limit(1);
    if (!row) return null;
    const openingEntries=await this.db.select().from(openingBalanceEntries).where(eq(openingBalanceEntries.openingBalanceId,row.openingBalanceId)).orderBy(asc(openingBalanceEntries.lineNumber));
    const bank = row.accountType === 'bank'
      ? { bankName: row.bankName ?? undefined, accountNumberLast4: row.accountNumberLast4 ?? undefined }
      : {};
    return {
      id: row.id, companyId: row.companyId, accountId: row.accountId, periodId: row.periodId,
      accountName: row.accountName, accountType: row.accountType as 'bank' | 'cash',
      ...bank, openingBalance: row.openingBalance,
      openingBalanceSource:row.openingBalanceSource as SavedLedgerSetup['openingBalanceSource'],openingEntries:openingEntries.map(entry=>({lineNumber:entry.lineNumber,accountCode:entry.accountCode,accountName:entry.accountName,side:entry.side as 'debit'|'credit',amount:entry.amount})),
      openingBalanceAsOf: row.openingBalanceAsOf, periodStart: row.periodStart,
      periodEnd: row.periodEnd, status: 'draft', periodStatus: row.periodStatus as 'open'|'locked', createdAt: row.createdAt,
    };
  }

  private present(record: SaveLedgerSetupRecord): SavedLedgerSetup {
    const bank = record.setup.accountType === 'bank'
      ? { bankName: record.setup.bankName, accountNumberLast4: record.setup.accountNumberLast4 }
      : {};
    return {
      id: record.id, companyId: record.companyId, accountId: record.accountId, periodId: record.periodId,
      accountName: record.setup.accountName, accountType: record.setup.accountType,
      ...bank, openingBalance: record.setup.openingBalance.toString(),
      openingBalanceSource:record.setup.openingBalanceSource,openingEntries:createOpeningBalanceEntries(record.setup).map(entry=>({...entry,amount:entry.amount.toString()})),
      openingBalanceAsOf: record.setup.openingBalanceAsOf,
      periodStart: record.setup.period.start, periodEnd: record.setup.period.end,
      status: 'draft', periodStatus: 'open', createdAt: record.createdAt,
    };
  }

  async lockCurrentPeriod(record:{readonly tenantId:string;readonly companyId:string;readonly actorId:string;readonly traceId:string;readonly lockedAt:Date}):Promise<SavedLedgerSetup|null>{const current=await this.find(record.tenantId,record.companyId);if(!current)return null;if(current.periodStatus==='locked')return current;await this.db.transaction(async tx=>{await tx.update(accountingPeriods).set({status:'locked',version:2,updatedAt:record.lockedAt,updatedBy:record.actorId}).where(and(eq(accountingPeriods.id,current.periodId),eq(accountingPeriods.tenantId,record.tenantId),eq(accountingPeriods.companyId,record.companyId),eq(accountingPeriods.status,'open')));await tx.insert(auditEvents).values({id:randomUUID(),tenantId:record.tenantId,actorId:record.actorId,action:'accounting_period.lock',resourceType:'accounting_period',resourceId:current.periodId,outcome:'success',traceId:record.traceId,metadata:{periodStart:current.periodStart,periodEnd:current.periodEnd}});await tx.insert(outboxEvents).values({id:randomUUID(),tenantId:record.tenantId,eventType:'accounting_period.locked.v1',aggregateType:'accounting_period',aggregateId:current.periodId,payload:{companyId:record.companyId,periodStart:current.periodStart,periodEnd:current.periodEnd},occurredAt:record.lockedAt});});return{...current,periodStatus:'locked'};}
}
