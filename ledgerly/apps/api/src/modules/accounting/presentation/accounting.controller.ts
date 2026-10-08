import { Body,Controller,Get,Param,ParseUUIDPipe,Post,Req } from '@nestjs/common';
import { financialReportsResponseSchema,voucherConfirmRequestSchema,voucherReversalRequestSchema,type VoucherConfirmRequest,type VoucherReversalRequest } from '@ledgerly/contracts';
import { ApiHeader,ApiOperation,ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { AccountingService } from '../application/accounting.service.js';
import type { SavedVoucher } from '../application/voucher-store.js';

@ApiTags('accounting')
@ApiHeader({name:'x-user-id',required:true})
@ApiHeader({name:'x-tenant-id',required:true})
@Controller('v1/companies/:companyId/accounting')
export class AccountingController{
  constructor(private readonly service:AccountingService){}
  @Get('chart-of-accounts')@ApiOperation({summary:'读取版本化 V1 科目模板'})
  chart(){return this.service.chart();}
  @Get('vouchers')@ApiOperation({summary:'列出凭证草稿'})
  async list(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest){const items=await this.service.list(companyId,requestContext(request,true));return{items:items.map(item=>this.present(item))};}
  @Post('vouchers/from-business-event/:eventId')@ApiOperation({summary:'从已确认业务事项确定性生成凭证草稿'})
  async generate(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('eventId',new ParseUUIDPipe())eventId:string,@Req()request:FastifyRequest){const result=await this.service.generate(companyId,eventId,requestContext(request,true));return{voucher:this.present(result.voucher),generated:result.generated};}
  @Post('vouchers/:voucherId/confirm')@ApiOperation({summary:'确认平衡凭证并正式入账'})
  async confirm(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('voucherId',new ParseUUIDPipe())voucherId:string,@Body(new ZodValidationPipe(voucherConfirmRequestSchema))input:VoucherConfirmRequest,@Req()request:FastifyRequest){return this.present(await this.service.confirm(companyId,voucherId,input.expectedVersion,requestContext(request,true)));}
  @Post('vouchers/:voucherId/reverse')@ApiOperation({summary:'通过相反分录冲销已确认凭证'})
  async reverse(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('voucherId',new ParseUUIDPipe())voucherId:string,@Body(new ZodValidationPipe(voucherReversalRequestSchema))input:VoucherReversalRequest,@Req()request:FastifyRequest){return this.present(await this.service.reverse(companyId,voucherId,input,requestContext(request,true)));}
  @Get('ledger')@ApiOperation({summary:'读取正式凭证明细账和本期科目余额'})
  async ledger(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest){return this.service.ledger(companyId,requestContext(request,true));}
  @Get('reports')@ApiOperation({summary:'基于正式账簿生成利润表和资产负债表'})
  async reports(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest){return financialReportsResponseSchema.parse(await this.service.reports(companyId,requestContext(request,true)));}
  @Post('period/lock')@ApiOperation({summary:'锁定当前会计期间'})
  async lock(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest){const result=await this.service.lockPeriod(companyId,requestContext(request,true));return{periodId:result.periodId,periodStart:result.periodStart,periodEnd:result.periodEnd,status:result.periodStatus};}
  private present(item:SavedVoucher){return{id:item.id,companyId:item.companyId,voucherDate:item.voucherDate,summary:item.summary,sourceBusinessEventId:item.sourceBusinessEventId,templateVersion:item.templateVersion,ruleVersion:item.ruleVersion,status:item.status,version:item.version,entries:item.entries.map(entry=>({id:entry.id,lineNumber:entry.lineNumber,accountCode:entry.accountCode,accountName:entry.accountName,side:entry.side,amount:entry.amount.toString()})),createdAt:item.createdAt.toISOString(),confirmedAt:item.confirmedAt?.toISOString(),reversedAt:item.reversedAt?.toISOString(),reversalOfVoucherId:item.reversalOfVoucherId};}
}
