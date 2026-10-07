import type { VoucherDraft, VoucherEntry } from '@ledgerly/domain';

export interface SavedVoucherEntry extends VoucherEntry { readonly id:string; }
export interface SavedVoucher extends Omit<VoucherDraft,'entries'> {
  readonly id:string;readonly companyId:string;readonly entries:readonly SavedVoucherEntry[];
  readonly createdAt:Date;readonly createdBy:string;
  readonly confirmedAt?:Date|undefined;readonly reversedAt?:Date|undefined;
  readonly reversalOfVoucherId?:string|undefined;
}
export interface SaveVoucherRecord {
  readonly id:string;readonly tenantId:string;readonly companyId:string;readonly actorId:string;
  readonly traceId:string;readonly voucher:VoucherDraft;readonly entryIds:readonly string[];readonly createdAt:Date;
}
export interface ConfirmVoucherRecord {
  readonly tenantId:string;readonly companyId:string;readonly voucherId:string;readonly expectedVersion:number;
  readonly actorId:string;readonly traceId:string;readonly confirmedAt:Date;
}
export interface ReverseVoucherRecord {
  readonly tenantId:string;readonly companyId:string;readonly originalVoucherId:string;readonly expectedVersion:number;
  readonly actorId:string;readonly traceId:string;readonly reversedAt:Date;readonly reversalId:string;
  readonly reversalEntryIds:readonly string[];readonly reversal:VoucherDraft;
}
export const VOUCHER_STORE=Symbol('VOUCHER_STORE');
export interface VoucherStore {
  save(record:SaveVoucherRecord):Promise<SavedVoucher>;
  list(tenantId:string,companyId:string):Promise<readonly SavedVoucher[]>;
  findById(tenantId:string,companyId:string,voucherId:string):Promise<SavedVoucher|null>;
  findBySource(tenantId:string,companyId:string,eventId:string,ruleVersion:string):Promise<SavedVoucher|null>;
  confirm(record:ConfirmVoucherRecord):Promise<SavedVoucher|null>;
  reverse(record:ReverseVoucherRecord):Promise<SavedVoucher|null>;
}
