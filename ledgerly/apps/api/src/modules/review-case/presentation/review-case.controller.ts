import{Body,Controller,Get,Param,ParseEnumPipe,ParseUUIDPipe,Post,Query,Req}from'@nestjs/common';
import{ApiHeader,ApiOperation,ApiTags}from'@nestjs/swagger';
import{reviewCaseAssignmentSchema,reviewCaseCreationResponseSchema,reviewCaseDecisionSchema,reviewCaseInputSchema,reviewCaseListResponseSchema,reviewCaseResponseSchema,reviewCaseTransitionSchema,reviewWorkItemInputSchema,type ReviewCaseAssignment,type ReviewCaseDecisionInput,type ReviewCaseInput,type ReviewCaseTransition,type ReviewWorkItemInput}from'@ledgerly/contracts';
import type{ReviewCaseStatus}from'@ledgerly/domain';
import type{FastifyRequest}from'fastify';
import{requestContext}from'../../../shared/request-context.js';
import{ApiZodBody,ApiZodCreatedResponse,ApiZodOkResponse}from'../../../shared/zod-openapi.js';
import{ZodValidationPipe}from'../../../shared/zod-validation.pipe.js';
import{ReviewCaseService}from'../application/review-case.service.js';
import type{ReviewCase}from'../application/review-case-store.js';
enum Status{Open='open',AwaitingDocuments='awaiting_documents',InReview='in_review',Approved='approved',Rejected='rejected',Cancelled='cancelled'}
enum Risk{Yellow='yellow',Red='red'}
@ApiTags('review-cases')@ApiHeader({name:'x-user-id',required:true})@ApiHeader({name:'x-tenant-id',required:true})
@Controller('v1/companies/:companyId/review-cases')
export class ReviewCaseController{
  constructor(private readonly service:ReviewCaseService){}
  @Post()@ApiOperation({summary:'从受控风险来源创建人工复核案件；同一来源幂等'})@ApiZodBody(reviewCaseInputSchema)@ApiZodCreatedResponse(reviewCaseCreationResponseSchema)
  async create(@Param('companyId',new ParseUUIDPipe())companyId:string,@Body(new ZodValidationPipe(reviewCaseInputSchema))input:ReviewCaseInput,@Req()request:FastifyRequest){const result=await this.service.create(companyId,input,requestContext(request,true));return{reviewCase:this.present(result.reviewCase),created:result.created};}
  @Get()@ApiOperation({summary:'按状态、风险和负责人筛选复核队列'})@ApiZodOkResponse(reviewCaseListResponseSchema)
  async list(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest,@Query('status',new ParseEnumPipe(Status,{optional:true}))status?:Status,@Query('riskLevel',new ParseEnumPipe(Risk,{optional:true}))riskLevel?:Risk,@Query('assignedTo',new ParseUUIDPipe({optional:true}))assignedTo?:string){return{items:(await this.service.list(companyId,{...(status?{status:status as ReviewCaseStatus}:{}),...(riskLevel?{riskLevel}:{}),...(assignedTo?{assignedTo}: {})},requestContext(request,true))).map(item=>this.present(item))};}
  @Get(':reviewCaseId')@ApiOperation({summary:'读取复核案件、补件请求与工作底稿'})@ApiZodOkResponse(reviewCaseResponseSchema)
  async get(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('reviewCaseId',new ParseUUIDPipe())id:string,@Req()request:FastifyRequest){return this.present(await this.service.get(companyId,id,requestContext(request,true)));}
  @Post(':reviewCaseId/assign')@ApiOperation({summary:'分派或转派复核案件'})@ApiZodBody(reviewCaseAssignmentSchema)@ApiZodOkResponse(reviewCaseResponseSchema)
  async assign(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('reviewCaseId',new ParseUUIDPipe())id:string,@Body(new ZodValidationPipe(reviewCaseAssignmentSchema))input:ReviewCaseAssignment,@Req()request:FastifyRequest){return this.present(await this.service.assign(companyId,id,input,requestContext(request,true)));}
  @Post(':reviewCaseId/work-items')@ApiOperation({summary:'追加不可变工作底稿或补件请求；附件仅引用既有文档 ID'})@ApiZodBody(reviewWorkItemInputSchema)@ApiZodOkResponse(reviewCaseResponseSchema)
  async append(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('reviewCaseId',new ParseUUIDPipe())id:string,@Body(new ZodValidationPipe(reviewWorkItemInputSchema))input:ReviewWorkItemInput,@Req()request:FastifyRequest){return this.present(await this.service.appendWorkItem(companyId,id,input,requestContext(request,true)));}
  @Post(':reviewCaseId/transitions')@ApiOperation({summary:'开始复核、等待补件、恢复复核或取消'})@ApiZodBody(reviewCaseTransitionSchema)@ApiZodOkResponse(reviewCaseResponseSchema)
  async transition(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('reviewCaseId',new ParseUUIDPipe())id:string,@Body(new ZodValidationPipe(reviewCaseTransitionSchema))input:ReviewCaseTransition,@Req()request:FastifyRequest){return this.present(await this.service.transition(companyId,id,input,requestContext(request,true)));}
  @Post(':reviewCaseId/decision')@ApiOperation({summary:'批准或驳回复核案件；创建人与复核人职责分离，且不修改来源事实'})@ApiZodBody(reviewCaseDecisionSchema)@ApiZodOkResponse(reviewCaseResponseSchema)
  async decide(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('reviewCaseId',new ParseUUIDPipe())id:string,@Body(new ZodValidationPipe(reviewCaseDecisionSchema))input:ReviewCaseDecisionInput,@Req()request:FastifyRequest){return this.present(await this.service.decide(companyId,id,input,requestContext(request,true)));}
  private present(item:ReviewCase){return{...item,createdAt:item.createdAt.toISOString(),updatedAt:item.updatedAt.toISOString(),items:item.items.map(work=>({...work,documentIds:[...work.documentIds],createdAt:work.createdAt.toISOString()}))};}
}
