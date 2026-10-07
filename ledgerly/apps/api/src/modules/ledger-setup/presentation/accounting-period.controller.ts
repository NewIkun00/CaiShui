import{Body,Controller,Get,Param,ParseUUIDPipe,Post,Req}from'@nestjs/common';
import{ApiHeader,ApiOperation,ApiTags}from'@nestjs/swagger';
import{periodReopenRequestInputSchema,type PeriodReopenRequestInput}from'@ledgerly/contracts';
import type{FastifyRequest}from'fastify';
import{requestContext}from'../../../shared/request-context.js';
import{ZodValidationPipe}from'../../../shared/zod-validation.pipe.js';
import{PeriodReopenService}from'../application/period-reopen.service.js';
import type{PeriodReopenRequest}from'../application/period-reopen-store.js';

@ApiTags('accounting-periods')
@ApiHeader({name:'x-user-id',required:true})
@ApiHeader({name:'x-tenant-id',required:true})
@Controller('v1/companies/:companyId/accounting-period/reopen-requests')
export class AccountingPeriodController{
  constructor(private readonly service:PeriodReopenService){}
  @Post()@ApiOperation({summary:'申请反结账；仅创建待复核工单，不直接解锁'})
  async request(@Param('companyId',new ParseUUIDPipe())companyId:string,@Body(new ZodValidationPipe(periodReopenRequestInputSchema))input:PeriodReopenRequestInput,@Req()request:FastifyRequest){const result=await this.service.request(companyId,input,requestContext(request,true));return{request:this.present(result.request),created:result.created};}
  @Get()@ApiOperation({summary:'列出反结账申请'})
  async list(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest){return{items:(await this.service.list(companyId,requestContext(request,true))).map(item=>this.present(item))};}
  private present(item:PeriodReopenRequest){return{...item,requestedAt:item.requestedAt.toISOString()};}
}
