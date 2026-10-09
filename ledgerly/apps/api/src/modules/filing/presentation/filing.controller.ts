import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  filingCalendarCreationResponseSchema,
  annualFilingArchiveResponseSchema,
  filingAdjustmentInputSchema,
  filingAdjustmentListResponseSchema,
  filingAdjustmentResponseSchema,
  filingAdjustmentTransitionSchema,
  filingCalendarInputSchema,
  filingCalendarListResponseSchema,
  filingPackageFreezeSchema,
  filingPackageInputSchema,
  filingPackageListResponseSchema,
  filingPackageResponseSchema,
  filingClosureInputSchema,
  filingClosureListResponseSchema,
  filingClosureResponseSchema,
  filingEvidenceInputSchema,
  filingEvidenceListResponseSchema,
  filingEvidenceResponseSchema,
  filingSopCreationResponseSchema,
  filingSopInputSchema,
  filingSopListResponseSchema,
  filingTaskGenerationResponseSchema,
  filingTaskGenerationSchema,
  filingTaskListResponseSchema,
  filingTaskResponseSchema,
  filingTaskTransitionSchema,
  filingTestResultFixtureInputSchema,
  filingTestResultFixtureResponseSchema,
  type FilingCalendarInput,
  type FilingAdjustmentInput,
  type FilingAdjustmentTransitionInput,
  type FilingClosureInput,
  type FilingEvidenceInput,
  type FilingPackageFreezeInput,
  type FilingPackageInput,
  type FilingSopInput,
  type FilingTaskGenerationInput,
  type FilingTaskTransitionInput,
  type FilingTestResultFixtureInput,
} from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import {
  ApiZodBody,
  ApiZodCreatedResponse,
  ApiZodOkResponse,
} from '../../../shared/zod-openapi.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { FilingService } from '../application/filing.service.js';
import { FilingEvidenceService } from '../application/filing-evidence.service.js';
import { FilingAdjustmentService } from '../application/filing-adjustment.service.js';
import { FilingArchiveService } from '../application/filing-archive.service.js';
import type {
  FilingCalendar,
  FilingAdjustmentWorkOrder,
  FilingClosure,
  FilingEvidence,
  FilingPackage,
  FilingSop,
  FilingTask,
} from '../application/filing-store.js';

@ApiTags('filing-calendars')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/filing-calendars')
export class FilingCalendarController {
  constructor(private readonly service: FilingService) {}
  @Post()
  @ApiOperation({ summary: '创建不可变版本化征期日历；正式日历必须携带 gov.cn 来源' })
  @ApiZodBody(filingCalendarInputSchema)
  @ApiZodCreatedResponse(filingCalendarCreationResponseSchema)
  async create(
    @Body(new ZodValidationPipe(filingCalendarInputSchema)) input: FilingCalendarInput,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.service.createCalendar(input, requestContext(request, true));
    return { calendar: this.calendar(result.calendar), created: result.created };
  }
  @Get()
  @ApiOperation({ summary: '列出当前租户的征期日历版本' })
  @ApiZodOkResponse(filingCalendarListResponseSchema)
  async list(@Req() request: FastifyRequest) {
    return {
      items: (await this.service.listCalendars(requestContext(request, true))).map((item) =>
        this.calendar(item),
      ),
    };
  }
  private calendar(item: FilingCalendar) {
    return {
      ...item,
      productionReady: item.source.type === 'official_notice',
      createdAt: item.createdAt.toISOString(),
      entries: item.entries.map((entry) => ({ ...entry })),
    };
  }
}

@ApiTags('filing-adjustments')
@ApiHeader({name:'x-user-id',required:true})
@ApiHeader({name:'x-tenant-id',required:true})
@Controller('v1/companies/:companyId/filing-adjustments')
export class FilingAdjustmentController{
  constructor(private readonly service:FilingAdjustmentService){}
  @Post()
  @ApiOperation({summary:'为冻结申报包建立作废、更正、补税或退税工单'})
  @ApiZodBody(filingAdjustmentInputSchema)
  @ApiZodCreatedResponse(filingAdjustmentResponseSchema)
  async create(@Param('companyId',new ParseUUIDPipe())companyId:string,@Body(new ZodValidationPipe(filingAdjustmentInputSchema))input:FilingAdjustmentInput,@Req()request:FastifyRequest){return this.present(await this.service.create(companyId,input,requestContext(request,true)));}
  @Get()
  @ApiOperation({summary:'列出公司的申报调整工单及不可变证据引用'})
  @ApiZodOkResponse(filingAdjustmentListResponseSchema)
  async list(@Param('companyId',new ParseUUIDPipe())companyId:string,@Req()request:FastifyRequest){return{items:(await this.service.list(companyId,requestContext(request,true))).map(item=>this.present(item))};}
  @Post(':workOrderId/transitions')
  @ApiOperation({summary:'按受控状态机复核、解决或取消申报调整工单'})
  @ApiZodBody(filingAdjustmentTransitionSchema)
  @ApiZodOkResponse(filingAdjustmentResponseSchema)
  async transition(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('workOrderId',new ParseUUIDPipe())workOrderId:string,@Body(new ZodValidationPipe(filingAdjustmentTransitionSchema))input:FilingAdjustmentTransitionInput,@Req()request:FastifyRequest){return this.present(await this.service.transition(companyId,workOrderId,input,requestContext(request,true)));}
  private present(item:FilingAdjustmentWorkOrder){return{...item,evidence:item.evidence.map(value=>({...value})),resolutionEvidence:item.resolutionEvidence.map(value=>({...value})),openedAt:item.openedAt.toISOString(),updatedAt:item.updatedAt.toISOString()};}
}

@ApiTags('filing-archives')
@ApiHeader({name:'x-user-id',required:true})
@ApiHeader({name:'x-tenant-id',required:true})
@Controller('v1/companies/:companyId/filing-archives')
export class FilingArchiveController{
  constructor(private readonly service:FilingArchiveService){}
  @Get(':year')
  @ApiOperation({summary:'生成含原始文件、账簿、报表、申报与校验和的年度可移植 JSON 档案'})
  @ApiZodOkResponse(annualFilingArchiveResponseSchema)
  async generate(@Param('companyId',new ParseUUIDPipe())companyId:string,@Param('year',new ParseIntPipe())year:number,@Req()request:FastifyRequest){if(year<2000||year>2100)throw new BadRequestException('year must be between 2000 and 2100');const result=await this.service.generate(companyId,year,requestContext(request,true));return{...result,generatedAt:result.generatedAt.toISOString()};}
}

@ApiTags('filing-sops')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/filing-sops')
export class FilingSopController {
  constructor(private readonly service: FilingService) {}
  @Post()
  @ApiOperation({ summary: '创建不可变版本化申报 SOP；正式 SOP 必须携带 gov.cn 来源' })
  @ApiZodBody(filingSopInputSchema)
  @ApiZodCreatedResponse(filingSopCreationResponseSchema)
  async create(
    @Body(new ZodValidationPipe(filingSopInputSchema)) input: FilingSopInput,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.service.createSop(input, requestContext(request, true));
    return { sop: this.sop(result.sop), created: result.created };
  }
  @Get()
  @ApiOperation({ summary: '列出当前租户的不可变申报 SOP 版本' })
  @ApiZodOkResponse(filingSopListResponseSchema)
  async list(@Req() request: FastifyRequest) {
    return {
      items: (await this.service.listSops(requestContext(request, true))).map((item) =>
        this.sop(item),
      ),
    };
  }
  private sop(item: FilingSop) {
    return {
      ...item,
      productionReady: item.source.type === 'official_notice',
      createdAt: item.createdAt.toISOString(),
      steps: item.steps.map((step) => ({ ...step })),
    };
  }
}

@ApiTags('filing-tasks')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/companies/:companyId/filing-tasks')
export class FilingTaskController {
  constructor(private readonly service: FilingService) {}
  @Post('generate')
  @ApiOperation({ summary: '从日历幂等生成申报任务；测试日历不得用于生产' })
  @ApiZodBody(filingTaskGenerationSchema)
  @ApiZodCreatedResponse(filingTaskGenerationResponseSchema)
  async generate(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(filingTaskGenerationSchema)) input: FilingTaskGenerationInput,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.service.generate(companyId, input, requestContext(request, true));
    return {
      items: result.items.map((item) => this.task(item, item.timing)),
      createdCount: result.createdCount,
    };
  }
  @Get()
  @ApiOperation({ summary: '列出申报任务并按查询日期派生到期/逾期状态' })
  @ApiZodOkResponse(filingTaskListResponseSchema)
  async list(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() request: FastifyRequest,
    @Query('asOf') asOf?: string,
  ) {
    this.date(asOf);
    return {
      items: (await this.service.list(companyId, requestContext(request, true), asOf)).map((item) =>
        this.task(item, item.timing),
      ),
    };
  }
  @Get('todos')
  @ApiOperation({ summary: '读取未完成的站内申报待办' })
  @ApiZodOkResponse(filingTaskListResponseSchema)
  async todos(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() request: FastifyRequest,
    @Query('asOf') asOf?: string,
  ) {
    this.date(asOf);
    return {
      items: (await this.service.todos(companyId, requestContext(request, true), asOf)).map(
        (item) => this.task(item, item.timing),
      ),
    };
  }
  @Post(':taskId/transitions')
  @ApiOperation({ summary: '按待办→已申报→已缴款顺序流转' })
  @ApiZodBody(filingTaskTransitionSchema)
  @ApiZodOkResponse(filingTaskResponseSchema)
  async transition(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body(new ZodValidationPipe(filingTaskTransitionSchema)) input: FilingTaskTransitionInput,
    @Req() request: FastifyRequest,
  ) {
    const item = await this.service.transition(
      companyId,
      taskId,
      input,
      requestContext(request, true),
    );
    return this.task(item, item.timing);
  }
  private task(item: FilingTask, timing: 'upcoming' | 'due_today' | 'overdue' | 'completed') {
    return {
      ...item,
      timing,
      ...(item.filedAt ? { filedAt: item.filedAt.toISOString() } : {}),
      ...(item.paidAt ? { paidAt: item.paidAt.toISOString() } : {}),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
  private date(value?: string) {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new BadRequestException('asOf must be an ISO date');
  }
}

@ApiTags('filing-packages')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/companies/:companyId/filing-packages')
export class FilingPackageController {
  constructor(
    private readonly service: FilingService,
    private readonly evidenceService: FilingEvidenceService,
  ) {}
  @Post('test-result-fixtures')
  @ApiOperation({ summary: '仅在显式内存模式为真实计算运行创建无税额测试引用' })
  @ApiZodBody(filingTestResultFixtureInputSchema)
  @ApiZodCreatedResponse(filingTestResultFixtureResponseSchema)
  createTestResultFixture(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(filingTestResultFixtureInputSchema))
    input: FilingTestResultFixtureInput,
    @Req() request: FastifyRequest,
  ) {
    return this.service.createTestResultFixture(companyId, input, requestContext(request, true));
  }
  @Post()
  @ApiOperation({ summary: '创建只引用不可变事实的申报包草稿，并返回全部冻结阻断' })
  @ApiZodBody(filingPackageInputSchema)
  @ApiZodCreatedResponse(filingPackageResponseSchema)
  async create(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(filingPackageInputSchema)) input: FilingPackageInput,
    @Req() request: FastifyRequest,
  ) {
    return this.present(
      await this.service.createPackage(companyId, input, requestContext(request, true)),
    );
  }
  @Get()
  @ApiOperation({ summary: '列出公司的申报包草稿、冻结包及更正关系' })
  @ApiZodOkResponse(filingPackageListResponseSchema)
  async list(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() request: FastifyRequest,
  ) {
    return {
      items: (await this.service.listPackages(companyId, requestContext(request, true))).map(
        (item) => this.present(item),
      ),
    };
  }
  @Get(':packageId')
  @ApiOperation({ summary: '读取申报包不可变引用快照与当前记录的阻断' })
  @ApiZodOkResponse(filingPackageResponseSchema)
  async get(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('packageId', new ParseUUIDPipe()) packageId: string,
    @Req() request: FastifyRequest,
  ) {
    return this.present(
      await this.service.getPackage(companyId, packageId, requestContext(request, true)),
    );
  }
  @Post(':packageId/freeze')
  @ApiOperation({ summary: '重新校验最新引用、红色阻断和哈希后冻结申报包' })
  @ApiZodBody(filingPackageFreezeSchema)
  @ApiZodOkResponse(filingPackageResponseSchema)
  async freeze(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('packageId', new ParseUUIDPipe()) packageId: string,
    @Body(new ZodValidationPipe(filingPackageFreezeSchema)) input: FilingPackageFreezeInput,
    @Req() request: FastifyRequest,
  ) {
    return this.present(
      await this.service.freezePackage(companyId, packageId, input, requestContext(request, true)),
    );
  }
  @Post(':packageId/evidence')
  @ApiOperation({ summary: '为冻结申报包追加不可变申报回执或完税凭证' })
  @ApiZodBody(filingEvidenceInputSchema)
  @ApiZodCreatedResponse(filingEvidenceResponseSchema)
  async archiveEvidence(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('packageId', new ParseUUIDPipe()) packageId: string,
    @Body(new ZodValidationPipe(filingEvidenceInputSchema)) input: FilingEvidenceInput,
    @Req() request: FastifyRequest,
  ) {
    return this.presentEvidence(
      await this.evidenceService.archive(
        companyId,
        packageId,
        input,
        requestContext(request, true),
      ),
    );
  }
  @Get(':packageId/evidence')
  @ApiOperation({ summary: '列出申报包的追加式回执与完税凭证' })
  @ApiZodOkResponse(filingEvidenceListResponseSchema)
  async listEvidence(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('packageId', new ParseUUIDPipe()) packageId: string,
    @Req() request: FastifyRequest,
  ) {
    return {
      items: (
        await this.evidenceService.listEvidence(companyId, packageId, requestContext(request, true))
      ).map((item) => this.presentEvidence(item)),
    };
  }
  @Post(':packageId/close')
  @ApiOperation({ summary: '核对冻结结果、回执和完税凭证后创建不可变关闭记录' })
  @ApiZodBody(filingClosureInputSchema)
  @ApiZodCreatedResponse(filingClosureResponseSchema)
  async close(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('packageId', new ParseUUIDPipe()) packageId: string,
    @Body(new ZodValidationPipe(filingClosureInputSchema)) input: FilingClosureInput,
    @Req() request: FastifyRequest,
  ) {
    return this.presentClosure(
      await this.evidenceService.close(companyId, packageId, input, requestContext(request, true)),
    );
  }
  @Get('closures/all')
  @ApiOperation({ summary: '列出公司的不可变申报关闭记录' })
  @ApiZodOkResponse(filingClosureListResponseSchema)
  async listClosures(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() request: FastifyRequest,
  ) {
    return {
      items: (
        await this.evidenceService.listClosures(companyId, requestContext(request, true))
      ).map((item) => this.presentClosure(item)),
    };
  }
  private present(item: FilingPackage) {
    return {
      ...item,
      snapshot: {
        ...item.snapshot,
        reviewDecisions: item.snapshot.reviewDecisions.map((decision) => ({ ...decision })),
      },
      blockers: [...item.blockers],
      ...(item.frozenAt ? { frozenAt: item.frozenAt.toISOString() } : {}),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
  private presentEvidence(item: FilingEvidence) {
    return {
      ...item,
      occurredAt: item.occurredAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
    };
  }
  private presentClosure(item: FilingClosure) {
    return { ...item, evidenceIds: [...item.evidenceIds], closedAt: item.closedAt.toISOString() };
  }
}
