import{BadRequestException,Body,Controller,Get,Param,ParseUUIDPipe,Post,Query,Req}from'@nestjs/common';
import{ApiHeader,ApiOperation,ApiTags}from'@nestjs/swagger';
import{filingCalendarCreationResponseSchema,filingCalendarInputSchema,filingCalendarListResponseSchema,filingSopCreationResponseSchema,filingSopInputSchema,filingSopListResponseSchema,filingTaskGenerationResponseSchema,filingTaskGenerationSchema,filingTaskListResponseSchema,filingTaskResponseSchema,filingTaskTransitionSchema,type FilingCalendarInput,type FilingSopInput,type FilingTaskGenerationInput,type FilingTaskTransitionInput}from'@ledgerly/contracts';
import type{FastifyRequest}from'fastify';
import{requestContext}from'../../../shared/request-context.js';
import{ApiZodBody,ApiZodCreatedResponse,ApiZodOkResponse}from'../../../shared/zod-openapi.js';
import{ZodValidationPipe}from'../../../shared/zod-validation.pipe.js';
import{FilingService}from'../application/filing.service.js';
import type{FilingCalendar,FilingSop,FilingTask}from'../application/filing-store.js';

@ApiTags('filing-calendars')@ApiHeader({name:'x-user-id',required:true})@ApiHeader({name:'x-tenant-id',required:true})
@Controller('v1/filing-calendars')
export class FilingCalendarController{
  constructor(private readonly service:FilingService){}
  @Post()@ApiOperation({summary:'创建不可变版本化征期日历；正式日历必须携带 gov.cn 来源'})@ApiZodBody(filingCalendarInputSchema)@ApiZodCreatedResponse(filingCalendarCreationResponseSchema)
  async create(@Body(new ZodValidationPipe(filingCalendarInputSchema))input:FilingCalendarInput,@Req()request:FastifyRequest){const result=await this.service.createCalendar(input,requestContext(request,true));return{calendar:this.calendar(result.calendar),created:result.created};}
  @Get()@ApiOperation({summary:'列出当前租户的征期日历版本'})@ApiZodOkResponse(filingCalendarListResponseSchema)
  async list(@Req()request:FastifyRequest){return{items:(await this.service.listCalendars(requestContext(request,true))).map(item=>this.calendar(item))};}
  private calendar(item:FilingCalendar){return{...item,productionReady:item.source.type==='official_notice',createdAt:item.createdAt.toISOString(),entries:item.entries.map(entry=>({...entry}))};}
}

@ApiTags('filing-sops')@ApiHeader({name:'x-user-id',required:true})@ApiHeader({name:'x-tenant-id',required:true})
@Controller('v1/filing-sops')
export class FilingSopController{
  constructor(private readonly service:FilingService){}
  @Post()@ApiOperation({summary:'创建不可变版本化申报 SOP；正式 SOP 必须携带 gov.cn 来源'})@ApiZodBody(filingSopInputSchema)@ApiZodCreatedResponse(filingSopCreationResponseSchema)
  async create(@Body(new ZodValidationPipe(filingSopInputSchema))input:FilingSopInput,@Req()request:FastifyRequest){const result=await this.service.createSop(input,requestContext(request,true));return{sop:this.sop(result.sop),created:result.created};}
  @Get()@ApiOperation({summary:'列出当前租户的不可变申报 SOP 版本'})@ApiZodOkResponse(filingSopListResponseSchema)
  async list(@Req()request:FastifyRequest){return{items:(await this.service.listSops(requestContext(request,true))).map(item=>this.sop(item))};}
  private sop(item:FilingSop){return{...item,productionReady:item.source.type==='official_notice',createdAt:item.createdAt.toISOString(),steps:item.steps.map(step=>({...step}))};}
}

@ApiTags('filing-tasks')@ApiHeader({name:'x-user-id',required:true})@ApiHeader({name:'x-tenant-id',required:true})
@Controller('v1/companies/:companyId/filing-tasks')
export class FilingTaskController{
  constructor(private readonly service:FilingService){}
  @Post('generate')@ApiOperation({summary:'从日历幂等生成申报任务；测试日历不得用于生产'})@ApiZodBody(filingTaskGenerationSchema)@ApiZodCreatedResponse(filingTaskGenerationResponseSchema)
  async generate(@Param('companyId',new ParseUUIDPipe())companyId:string,@Body(new ZodValidationPipe(filingTaskGenerationSchema))input:FilingTaskGenerationInput,@Req()request:FastifyRequest){const result=await this.service.generate(companyId,input,requestContext(request,true));return{items:result.items.map(item=>this.task(item,item.timing)),createdCount:result.createdCount};}
  @Get()@ApiOperation({summary:'列出申报任务并按查询日期派生到期/逾期状态'})@ApiZodOkResponse(filingTaskListResponseSchema)
  async list(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest,@Query('asOf')asOf?:string){this.date(asOf);return{items:(await this.service.list(companyId,requestContext(request,true),asOf)).map(item=>this.task(item,item.timing))};}
  @Get('todos')@ApiOperation({summary:'读取未完成的站内申报待办'})@ApiZodOkResponse(filingTaskListResponseSchema)
  async todos(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest,@Query('asOf')asOf?:string){this.date(asOf);return{items:(await this.service.todos(companyId,requestContext(request,true),asOf)).map(item=>this.task(item,item.timing))};}
  @Post(':taskId/transitions')@ApiOperation({summary:'按待办→已申报→已缴款顺序流转'})@ApiZodBody(filingTaskTransitionSchema)@ApiZodOkResponse(filingTaskResponseSchema)
  async transition(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('taskId',new ParseUUIDPipe())taskId:string,@Body(new ZodValidationPipe(filingTaskTransitionSchema))input:FilingTaskTransitionInput,@Req()request:FastifyRequest){const item=await this.service.transition(companyId,taskId,input,requestContext(request,true));return this.task(item,item.timing);}
  private task(item:FilingTask,timing:'upcoming'|'due_today'|'overdue'|'completed'){return{...item,timing,...(item.filedAt?{filedAt:item.filedAt.toISOString()}:{}),...(item.paidAt?{paidAt:item.paidAt.toISOString()}:{}),createdAt:item.createdAt.toISOString(),updatedAt:item.updatedAt.toISOString()};}
  private date(value?:string){if(value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new BadRequestException('asOf must be an ISO date');}
}
