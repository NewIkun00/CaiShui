import{Body,Controller,Get,Param,ParseUUIDPipe,Post,Req}from'@nestjs/common';
import{ApiHeader,ApiOperation,ApiTags}from'@nestjs/swagger';
import{
  reconciliationCheckIssueSchema,reconciliationCheckRunResponseSchema,reconciliationIssueTriageInputSchema,
  reconciliationOverviewSchema,settlementInputSchema,settlementResponseSchema,
  type ReconciliationIssueTriageInput,type SettlementInputRequest,
}from'@ledgerly/contracts';
import type{FastifyRequest}from'fastify';
import{requestContext}from'../../../shared/request-context.js';
import{ZodValidationPipe}from'../../../shared/zod-validation.pipe.js';
import{ApiZodBody,ApiZodCreatedResponse,ApiZodOkResponse}from'../../../shared/zod-openapi.js';
import type{SavedReconciliationCheckIssue,SavedReconciliationCheckRun}from'../application/reconciliation-check-store.js';
import{ReconciliationService}from'../application/reconciliation.service.js';
import type{SavedSettlement}from'../application/settlement-store.js';

@ApiTags('reconciliation')
@ApiHeader({name:'x-user-id',required:true})
@ApiHeader({name:'x-tenant-id',required:true})
@Controller('v1/companies/:companyId/reconciliation')
export class ReconciliationController{
  constructor(private readonly service:ReconciliationService){}

  @Get()@ApiOperation({summary:'读取发票与收付款核销概览'})@ApiZodOkResponse(reconciliationOverviewSchema)
  overview(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest){return this.service.overview(companyId,requestContext(request,true))}

  @Post('settlements')@ApiOperation({summary:'创建发票与收付款的部分或完整核销'})
  @ApiZodBody(settlementInputSchema)@ApiZodCreatedResponse(settlementResponseSchema)
  async create(@Param('companyId',new ParseUUIDPipe())companyId:string,@Body(new ZodValidationPipe(settlementInputSchema))input:SettlementInputRequest,@Req()request:FastifyRequest){return this.presentSettlement(await this.service.create(companyId,input,requestContext(request,true)))}

  @Post('check-runs')@ApiOperation({summary:'冻结当前核销输入并一次返回全部未解决差异'})
  @ApiZodCreatedResponse(reconciliationCheckRunResponseSchema)
  async runCheck(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest){return this.presentRun(await this.service.runCheck(companyId,requestContext(request,true)))}

  @Get('check-runs/latest')@ApiOperation({summary:'读取最近一次不可变勾稽检查快照和处理状态'})
  @ApiZodOkResponse(reconciliationCheckRunResponseSchema)
  async latestCheck(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest){return this.presentRun(await this.service.latestCheck(companyId,requestContext(request,true)))}

  @Post('check-runs/:runId/issues/:issueId/triage')@ApiOperation({summary:'记录勾稽差异的人工调查状态；不会直接解除申报阻断'})
  @ApiZodBody(reconciliationIssueTriageInputSchema)@ApiZodCreatedResponse(reconciliationCheckIssueSchema)
  async triage(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('runId',new ParseUUIDPipe())runId:string,@Param('issueId',new ParseUUIDPipe())issueId:string,@Body(new ZodValidationPipe(reconciliationIssueTriageInputSchema))input:ReconciliationIssueTriageInput,@Req()request:FastifyRequest){return this.presentIssue(await this.service.triageIssue(companyId,runId,issueId,input,requestContext(request,true)))}

  private presentSettlement(item:SavedSettlement){return{id:item.id,companyId:item.companyId,invoiceId:item.invoiceId,paymentEventId:item.paymentEventId,amount:item.amount.toString(),createdAt:item.createdAt.toISOString()}}
  private presentRun(run:SavedReconciliationCheckRun){return{id:run.id,companyId:run.companyId,periodId:run.periodId,periodStart:run.periodStart,periodEnd:run.periodEnd,inputSnapshot:run.inputSnapshot,inputHash:run.inputHash,grade:run.grade,blocksFiling:run.blocksFiling,totalIssues:run.totalIssues,yellowIssues:run.yellowIssues,redIssues:run.redIssues,issues:run.issues.map(item=>this.presentIssue(item)),createdAt:run.createdAt.toISOString(),createdBy:run.createdBy}}
  private presentIssue(issue:SavedReconciliationCheckIssue){return{id:issue.id,code:issue.code,severity:issue.severity,subjectType:issue.subjectType,subjectId:issue.subjectId,amount:issue.amount,message:issue.message,suggestedAction:issue.suggestedAction,triageStatus:issue.triageStatus,triageVersion:issue.triageVersion,...(issue.triageNote?{triageNote:issue.triageNote}:{}),...(issue.triagedBy?{triagedBy:issue.triagedBy}:{}),...(issue.triagedAt?{triagedAt:issue.triagedAt.toISOString()}: {})}}
}
