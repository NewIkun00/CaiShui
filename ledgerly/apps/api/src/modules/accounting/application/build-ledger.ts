import { Money, VoucherStatus, v1ChartOfAccounts } from '@ledgerly/domain';
import type { SavedLedgerSetup } from '../../ledger-setup/application/ledger-setup-store.js';
import type { SavedVoucher } from './voucher-store.js';

export interface TrialBalanceRow {
  readonly accountCode:string;readonly accountName:string;readonly openingDebit:string;readonly openingCredit:string;
  readonly debitMovement:string;readonly creditMovement:string;readonly endingDebit:string;readonly endingCredit:string;
}

export function buildLedger(setup:SavedLedgerSetup,items:readonly SavedVoucher[]){
  const posted=items.filter(item=>item.status===VoucherStatus.Confirmed||item.status===VoucherStatus.Reversed);
  const rows=new Map<string,{accountCode:string;accountName:string;openingDebit:Money;openingCredit:Money;debit:Money;credit:Money}>();
  for(const account of v1ChartOfAccounts())rows.set(account.code,{accountCode:account.code,accountName:account.name,openingDebit:Money.zero(),openingCredit:Money.zero(),debit:Money.zero(),credit:Money.zero()});
  for(const entry of setup.openingEntries){
    const row=rows.get(entry.accountCode)??{accountCode:entry.accountCode,accountName:entry.accountName,openingDebit:Money.zero(),openingCredit:Money.zero(),debit:Money.zero(),credit:Money.zero()},amount=Money.from(entry.amount);
    rows.set(entry.accountCode,{...row,[entry.side==='debit'?'openingDebit':'openingCredit']:row[entry.side==='debit'?'openingDebit':'openingCredit'].add(amount)});
  }
  for(const voucher of posted)for(const entry of voucher.entries){
    const row=rows.get(entry.accountCode)??{accountCode:entry.accountCode,accountName:entry.accountName,openingDebit:Money.zero(),openingCredit:Money.zero(),debit:Money.zero(),credit:Money.zero()};
    rows.set(entry.accountCode,{...row,[entry.side]:row[entry.side].add(entry.amount)});
  }
  const trialBalance:TrialBalanceRow[]=[...rows.values()].filter(row=>!row.openingDebit.equals(Money.zero())||!row.openingCredit.equals(Money.zero())||!row.debit.equals(Money.zero())||!row.credit.equals(Money.zero())).map(row=>{
    const net=row.openingDebit.subtract(row.openingCredit).add(row.debit).subtract(row.credit);
    return{accountCode:row.accountCode,accountName:row.accountName,openingDebit:row.openingDebit.toString(),openingCredit:row.openingCredit.toString(),debitMovement:row.debit.toString(),creditMovement:row.credit.toString(),endingDebit:net.isNegative()?'0.00':net.toString(),endingCredit:net.isNegative()?Money.zero().subtract(net).toString():'0.00'};
  });
  const journal=posted.flatMap(voucher=>voucher.entries.map(entry=>({voucherId:voucher.id,voucherDate:voucher.voucherDate,summary:voucher.summary,status:voucher.status,reversalOfVoucherId:voucher.reversalOfVoucherId,accountCode:entry.accountCode,accountName:entry.accountName,side:entry.side,amount:entry.amount.toString()})));
  return{period:{start:setup.periodStart,end:setup.periodEnd,status:setup.periodStatus},openingBalance:{accountName:setup.accountName,amount:setup.openingBalance,source:setup.openingBalanceSource,asOf:setup.openingBalanceAsOf,includedInTrialBalance:true,entries:setup.openingEntries},journal,trialBalance};
}
