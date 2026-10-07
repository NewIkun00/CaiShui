import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  documentUploadSchema, documentVersionUploadSchema,
  type DocumentUploadRequest, type DocumentVersionUploadRequest,
} from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { DocumentService } from '../application/document.service.js';
import type { SavedDocument } from '../application/document-store.js';

@ApiTags('documents')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/companies/:companyId/documents')
export class DocumentController {
  constructor(private readonly service: DocumentService) {}

  @Post()
  @ApiOperation({ summary: '上传私有单据并建立首个版本' })
  async upload(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(documentUploadSchema)) input: DocumentUploadRequest,
    @Req() request: FastifyRequest) {
    const result = await this.service.upload(companyId, input, requestContext(request, true));
    return { document: this.present(result.document), duplicate: result.duplicate };
  }

  @Get()
  @ApiOperation({ summary: '列出单据档案' })
  async list(@Param('companyId', new ParseUUIDPipe()) companyId: string, @Req() request: FastifyRequest) {
    const items = await this.service.list(companyId, requestContext(request, true));
    return { items: items.map((item) => this.present(item)) };
  }

  @Post(':documentId/versions')
  @ApiOperation({ summary: '为单据增加不可覆盖的新版本' })
  async addVersion(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body(new ZodValidationPipe(documentVersionUploadSchema)) input: DocumentVersionUploadRequest,
    @Req() request: FastifyRequest) {
    const result = await this.service.addVersion(companyId, documentId, input, requestContext(request, true));
    return { document: this.present(result.document), duplicate: result.duplicate };
  }

  @Get(':documentId/versions/:versionId/content')
  @ApiOperation({ summary: '读取私有单据版本内容' })
  content(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string, @Req() request: FastifyRequest) {
    return this.service.content(companyId, documentId, versionId, requestContext(request, true));
  }

  @Post(':documentId/links/business-events/:eventId')
  @ApiOperation({ summary: '将单据证据关联到业务事项' })
  async link(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string, @Req() request: FastifyRequest) {
    return this.present(await this.service.linkBusinessEvent(companyId, documentId, eventId, requestContext(request, true)));
  }

  private present(item: SavedDocument) {
    return {
      id: item.id, companyId: item.companyId, type: item.type, title: item.title,
      accountingMonth: item.accountingMonth, status: item.status, currentVersion: item.currentVersion,
      versions: item.versions.map((version) => ({
        id: version.id, versionNumber: version.versionNumber, fileName: version.fileName,
        mediaType: version.mediaType, byteSize: version.byteSize, sha256: version.sha256,
        scanStatus: version.scanStatus, scanEngine: version.scanEngine, createdAt: version.createdAt.toISOString(),
      })),
      linkedBusinessEventIds: item.linkedBusinessEventIds, createdAt: item.createdAt.toISOString(),
    };
  }
}
