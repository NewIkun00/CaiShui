import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  policySourceInputSchema,
  rulePackageInputSchema,
  ruleVersionInputSchema,
  ruleVersionReviewSchema,
  ruleTestEvidenceSchema,
  ruleApprovalSchema,
  ruleScheduleSchema,
  ruleActivationSchema,
  ruleWithdrawalSchema,
  goldenFixtureSetInputSchema,
  ruleShadowRunInputSchema,
  ruleShadowRunCreationResponseSchema,
  ruleShadowRunListResponseSchema,
  ruleShadowRunResponseSchema,
  type PolicySourceInputRequest,
  type RulePackageInputRequest,
  type RuleVersionInputRequest,
  type RuleVersionReviewRequest,
  type RuleTestEvidenceRequest,
  type RuleApprovalRequest,
  type RuleScheduleRequest,
  type RuleActivationRequest,
  type RuleWithdrawalRequest,
  type GoldenFixtureSetInputRequest,
  type RuleShadowRunInputRequest,
} from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { PolicyRuleService } from '../application/policy-rule.service.js';
import type { SavedRuleShadowRun } from '../application/policy-rule-store.js';

@ApiTags('policy-rules')
@ApiHeader({ name: 'x-user-id', required: true })
@Controller('v1')
export class PolicyRuleController {
  constructor(private readonly service: PolicyRuleService) {}

  @Post('policy-sources')
  @ApiOperation({ summary: '收录经过官方来源校验的政策文件' })
  createPolicySource(
    @Body(new ZodValidationPipe(policySourceInputSchema)) input: PolicySourceInputRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.service.createPolicySource(input, requestContext(request, false));
  }

  @Get('policy-sources')
  @ApiOperation({ summary: '列出政策来源' })
  async listPolicySources(@Req() request: FastifyRequest) {
    requestContext(request, false);
    return { items: await this.service.listPolicySources() };
  }

  @Post('rule-packages')
  @ApiOperation({ summary: '创建稳定标识的税务规则包' })
  createRulePackage(
    @Body(new ZodValidationPipe(rulePackageInputSchema)) input: RulePackageInputRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.service.createRulePackage(input, requestContext(request, false));
  }

  @Get('rule-packages')
  @ApiOperation({ summary: '列出税务规则包' })
  async listRulePackages(@Req() request: FastifyRequest) {
    requestContext(request, false);
    return { items: await this.service.listRulePackages() };
  }

  @Post('rule-packages/:rulePackageId/versions')
  @ApiOperation({ summary: '创建不可执行的规则草稿版本' })
  createRuleVersion(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Body(new ZodValidationPipe(ruleVersionInputSchema)) input: RuleVersionInputRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.service.createRuleVersion(rulePackageId, input, requestContext(request, false));
  }

  @Get('rule-packages/:rulePackageId/versions')
  @ApiOperation({ summary: '列出规则包的全部版本' })
  async listRuleVersions(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Req() request: FastifyRequest,
  ) {
    requestContext(request, false);
    return { items: await this.service.listRuleVersions(rulePackageId) };
  }

  @Post('rule-packages/:rulePackageId/versions/:ruleVersionId/reviews')
  @ApiOperation({ summary: '执行工程复核或财税复核，强制职责分离' })
  reviewRuleVersion(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Param('ruleVersionId', new ParseUUIDPipe()) ruleVersionId: string,
    @Body(new ZodValidationPipe(ruleVersionReviewSchema)) input: RuleVersionReviewRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.service.reviewRuleVersion(rulePackageId, ruleVersionId, input, requestContext(request, false));
  }

  @Post('rule-packages/:rulePackageId/versions/:ruleVersionId/test-evidence')
  @ApiOperation({ summary: '登记财税审核人签署的全量黄金样本测试证据' })
  recordRuleTestEvidence(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Param('ruleVersionId', new ParseUUIDPipe()) ruleVersionId: string,
    @Body(new ZodValidationPipe(ruleTestEvidenceSchema)) input: RuleTestEvidenceRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.service.recordRuleTestEvidence(
      rulePackageId, ruleVersionId, input, requestContext(request, false),
    );
  }

  @Post('rule-packages/:rulePackageId/versions/:ruleVersionId/fixture-sets')
  @ApiOperation({ summary: '由财税复核人登记脱敏、签审且不可变的黄金样本集' })
  createGoldenFixtureSet(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Param('ruleVersionId', new ParseUUIDPipe()) ruleVersionId: string,
    @Body(new ZodValidationPipe(goldenFixtureSetInputSchema)) input: GoldenFixtureSetInputRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.service.createGoldenFixtureSet(
      rulePackageId, ruleVersionId, input, requestContext(request, false),
    );
  }

  @Get('rule-packages/:rulePackageId/versions/:ruleVersionId/fixture-sets')
  @ApiOperation({ summary: '列出规则版本的专业签审黄金样本集' })
  async listGoldenFixtureSets(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Param('ruleVersionId', new ParseUUIDPipe()) ruleVersionId: string,
    @Req() request: FastifyRequest,
  ) {
    requestContext(request, false);
    return { items: await this.service.listGoldenFixtureSets(rulePackageId, ruleVersionId) };
  }

  @Post('rule-packages/:rulePackageId/versions/:ruleVersionId/fixture-sets/:fixtureSetId/executions')
  @ApiOperation({ summary: '使用版本化计算实现逐例执行黄金样本并生成证据哈希' })
  executeGoldenFixtureSet(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Param('ruleVersionId', new ParseUUIDPipe()) ruleVersionId: string,
    @Param('fixtureSetId', new ParseUUIDPipe()) fixtureSetId: string,
    @Req() request: FastifyRequest,
  ) {
    return this.service.executeGoldenFixtureSet(
      rulePackageId, ruleVersionId, fixtureSetId, requestContext(request, false),
    );
  }

  @Post('rule-packages/:rulePackageId/shadow-runs')
  @ApiOperation({ summary: '用同一签审样本对比基准与候选规则版本并固化差异证据' })
  async executeRuleShadowRun(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Body(new ZodValidationPipe(ruleShadowRunInputSchema)) input: RuleShadowRunInputRequest,
    @Req() request: FastifyRequest,
  ) {
    const result=await this.service.executeRuleShadowRun(rulePackageId,input,requestContext(request,false));
    return ruleShadowRunCreationResponseSchema.parse({run:this.presentShadowRun(result.run),created:result.created});
  }

  @Get('rule-packages/:rulePackageId/shadow-runs')
  @ApiOperation({ summary: '列出规则包的不可变影子计算记录' })
  async listRuleShadowRuns(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Req() request: FastifyRequest,
  ) {
    requestContext(request,false);
    const items=await this.service.listRuleShadowRuns(rulePackageId);
    return ruleShadowRunListResponseSchema.parse({items:items.map((item)=>this.presentShadowRun(item))});
  }

  @Get('rule-packages/:rulePackageId/shadow-runs/:runId')
  @ApiOperation({ summary: '读取影子计算逐样例差异和不可变证据哈希' })
  async findRuleShadowRun(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Req() request: FastifyRequest,
  ) {
    requestContext(request,false);
    return ruleShadowRunResponseSchema.parse(this.presentShadowRun(
      await this.service.findRuleShadowRun(rulePackageId,runId),
    ));
  }

  @Post('rule-packages/:rulePackageId/versions/:ruleVersionId/approval')
  @ApiOperation({ summary: '由独立审批人批准已通过测试的规则版本' })
  approveRuleVersion(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Param('ruleVersionId', new ParseUUIDPipe()) ruleVersionId: string,
    @Body(new ZodValidationPipe(ruleApprovalSchema)) input: RuleApprovalRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.service.approveRuleVersion(rulePackageId, ruleVersionId, input, requestContext(request, false));
  }

  @Post('rule-packages/:rulePackageId/versions/:ruleVersionId/schedule')
  @ApiOperation({ summary: '由审批人安排规则版本的未来激活时间' })
  scheduleRuleVersion(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Param('ruleVersionId', new ParseUUIDPipe()) ruleVersionId: string,
    @Body(new ZodValidationPipe(ruleScheduleSchema)) input: RuleScheduleRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.service.scheduleRuleVersion(rulePackageId, ruleVersionId, input, requestContext(request, false));
  }

  @Post('rule-packages/:rulePackageId/versions/:ruleVersionId/activation')
  @ApiOperation({ summary: '在计划时间到期后激活规则，并自动替代同规则包的旧活动版本' })
  activateRuleVersion(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Param('ruleVersionId', new ParseUUIDPipe()) ruleVersionId: string,
    @Body(new ZodValidationPipe(ruleActivationSchema)) input: RuleActivationRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.service.activateRuleVersion(rulePackageId, ruleVersionId, input, requestContext(request, false));
  }

  @Post('rule-packages/:rulePackageId/versions/:ruleVersionId/withdrawal')
  @ApiOperation({ summary: '紧急撤回活动规则版本并保留不可变发布记录' })
  withdrawRuleVersion(
    @Param('rulePackageId', new ParseUUIDPipe()) rulePackageId: string,
    @Param('ruleVersionId', new ParseUUIDPipe()) ruleVersionId: string,
    @Body(new ZodValidationPipe(ruleWithdrawalSchema)) input: RuleWithdrawalRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.service.withdrawRuleVersion(rulePackageId, ruleVersionId, input, requestContext(request, false));
  }

  private presentShadowRun(run:SavedRuleShadowRun){return{
    ...run,executedAt:run.executedAt.toISOString(),
  };}
}
