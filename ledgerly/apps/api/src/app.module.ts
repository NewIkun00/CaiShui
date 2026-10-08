import { Module } from '@nestjs/common';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { ProfileScopeModule } from './modules/profile-scope/profile-scope.module.js';
import { LedgerSetupModule } from './modules/ledger-setup/ledger-setup.module.js';
import { CounterpartyModule } from './modules/counterparty/counterparty.module.js';
import { BusinessEventModule } from './modules/business-event/business-event.module.js';
import { BankImportModule } from './modules/bank-import/bank-import.module.js';
import { InvoiceModule } from './modules/invoice/invoice.module.js';
import { DocumentModule } from './modules/document/document.module.js';
import { AccountingModule } from './modules/accounting/accounting.module.js';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module.js';
import { PolicyRuleModule } from './modules/policy-rule/policy-rule.module.js';
import { CalculationModule } from './modules/calculation/calculation.module.js';

@Module({ imports: [DatabaseModule, OrganizationModule, ProfileScopeModule, LedgerSetupModule, CounterpartyModule, BusinessEventModule, BankImportModule, InvoiceModule, DocumentModule, ReconciliationModule, AccountingModule, PolicyRuleModule, CalculationModule] })
export class AppModule {}
