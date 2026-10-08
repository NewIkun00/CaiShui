import { Module } from '@nestjs/common';
import { VOUCHER_STORE } from './application/voucher-store.js';
import { MemoryVoucherStore } from './infrastructure/memory-voucher.store.js';
import { PostgresVoucherStore } from './infrastructure/postgres-voucher.store.js';

const providers=process.env['STORAGE_MODE']==='memory'?[MemoryVoucherStore,{provide:VOUCHER_STORE,useExisting:MemoryVoucherStore}]:[PostgresVoucherStore,{provide:VOUCHER_STORE,useExisting:PostgresVoucherStore}];
@Module({providers,exports:[VOUCHER_STORE]})
export class VoucherStoreModule{}
