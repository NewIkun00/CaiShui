import{Body,Controller,Get,Param,ParseUUIDPipe,Post,Req}from'@nestjs/common';
import{ApiHeader,ApiOperation,ApiTags}from'@nestjs/swagger';
import{settlementInputSchema,type SettlementInputRequest}from'@ledgerly/contracts';
import type{FastifyRequest}from'fastify';
import{requestContext}from'../../../shared/request-context.js';
import{ZodValidationPipe}from'../../../shared/zod-validation.pipe.js';
import{ReconciliationService}from'../application/reconciliation.service.js';
import type{SavedSettlement}from'../application/settlement-store.js';
@ApiTags('reconciliation')@ApiHeader({name:'x-user-id',required:true})@ApiHeader({name:'x-tenant-id',required:true})
@Controller('v1/companies/:companyId/reconciliation')
export class ReconciliationController{constructor(private readonly service:ReconciliationService){}
@Get()@ApiOperation({summary:'读取发票与收付款核销概览'})overview(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest){return this.service.overview(companyId,requestContext(request,true))}
@Post('settlements')@ApiOperation({summary:'创建发票与收付款的部分或完整核销'})async create(@Param('companyId',new ParseUUIDPipe())companyId:string,@Body(new ZodValidationPipe(settlementInputSchema))input:SettlementInputRequest,@Req()request:FastifyRequest){return this.present(await this.service.create(companyId,input,requestContext(request,true)))}
private present(item:SavedSettlement){return{id:item.id,companyId:item.companyId,invoiceId:item.invoiceId,paymentEventId:item.paymentEventId,amount:item.amount.toString(),createdAt:item.createdAt.toISOString()}}}
