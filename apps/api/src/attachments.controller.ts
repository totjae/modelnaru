import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { firstHeader } from './auth.controller.js';
import {
  AuthenticatedMutationGuard,
  type AuthenticatedRequest,
  AuthenticatedSessionGuard,
} from './auth.guard.js';
import { AttachmentLimitError } from './attachments.repository.js';
import { AttachmentNotFoundError } from './attachments.repository.js';
import {
  AttachmentsService,
  FileInputError,
  FileImageDimensionsError,
  FilePdfInvalidError,
  FilePdfOcrRequiredError,
  FilePdfPageLimitError,
  FilePdfPasswordProtectedError,
  FileStorageLowError,
  FileTextTooLargeError,
  FileTooLargeError,
  FileTypeUnsupportedError,
  type UploadByteStream,
} from './attachments.service.js';
import { ConversationNotFoundError } from './chats.repository.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface UploadRequest extends AuthenticatedRequest, UploadByteStream {}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

@Controller('files')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get('conversations/:conversationId/pending')
  @UseGuards(AuthenticatedSessionGuard)
  async listPending(
    @Param('conversationId') conversationId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(conversationId)) {
      this.error('FILE_INPUT_INVALID', 'File input is invalid.', 400);
    }
    try {
      return {
        attachments: await this.attachments.listPending(
          request.authenticatedSession!.principal,
          conversationId,
        ),
      };
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post('conversations/:conversationId')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthenticatedMutationGuard)
  async upload(
    @Param('conversationId') conversationId: string,
    @Req() request: UploadRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const fileName = firstHeader(request.headers['x-file-name']);
    const contentType = firstHeader(request.headers['content-type']);
    const mediaType = firstHeader(request.headers['x-file-media-type']);
    const includeHeader = firstHeader(request.headers['x-include-in-future']);
    if (
      !UUID.test(conversationId) ||
      !fileName ||
      !mediaType ||
      contentType?.split(';', 1)[0]?.trim().toLowerCase() !==
        'application/octet-stream' ||
      !['true', 'false'].includes(includeHeader ?? '')
    ) {
      this.error('FILE_INPUT_INVALID', 'File input is invalid.', 400);
    }
    try {
      return await this.attachments.upload(
        request.authenticatedSession!.principal,
        {
          conversationId,
          fileName,
          includeInFutureMessages: includeHeader === 'true',
          mediaType,
          stream: request,
        },
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Patch('conversations/:conversationId/:attachmentId')
  @UseGuards(AuthenticatedMutationGuard)
  async updatePending(
    @Param('conversationId') conversationId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const includeInFutureMessages =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).includeInFutureMessages
        : undefined;
    if (
      !UUID.test(conversationId) ||
      !UUID.test(attachmentId) ||
      typeof includeInFutureMessages !== 'boolean'
    ) {
      this.error('FILE_INPUT_INVALID', 'File input is invalid.', 400);
    }
    try {
      return await this.attachments.updatePending(
        request.authenticatedSession!.principal,
        conversationId,
        attachmentId,
        includeInFutureMessages,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Delete('conversations/:conversationId/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthenticatedMutationGuard)
  async deletePending(
    @Param('conversationId') conversationId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(conversationId) || !UUID.test(attachmentId)) {
      this.error('FILE_INPUT_INVALID', 'File input is invalid.', 400);
    }
    try {
      await this.attachments.deletePending(
        request.authenticatedSession!.principal,
        conversationId,
        attachmentId,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  private mapError(error: unknown): never {
    if (
      error instanceof ConversationNotFoundError ||
      error instanceof AttachmentNotFoundError
    ) {
      this.error('FILE_NOT_FOUND', 'Attachment was not found.', 404);
    }
    if (error instanceof AttachmentLimitError) {
      this.error(
        'FILE_ATTACHMENT_LIMIT',
        'The attachment limit was reached.',
        400,
      );
    }
    if (error instanceof FileTooLargeError) {
      this.error('FILE_TOO_LARGE', 'The file is too large.', 413);
    }
    if (error instanceof FileTextTooLargeError) {
      this.error(
        'FILE_TEXT_TOO_LARGE',
        'The extracted text is too large.',
        413,
      );
    }
    if (error instanceof FilePdfPageLimitError) {
      this.error(
        'FILE_PDF_PAGE_LIMIT',
        'The PDF exceeds the configured page limit.',
        413,
      );
    }
    if (error instanceof FilePdfPasswordProtectedError) {
      this.error(
        'FILE_PDF_PASSWORD_PROTECTED',
        'Password-protected PDFs are not supported.',
        422,
      );
    }
    if (error instanceof FilePdfOcrRequiredError) {
      this.error(
        'FILE_PDF_OCR_REQUIRED',
        'The PDF does not contain an extractable text layer.',
        422,
      );
    }
    if (error instanceof FilePdfInvalidError) {
      this.error('FILE_PDF_INVALID', 'The PDF is invalid or damaged.', 422);
    }
    if (error instanceof FileImageDimensionsError) {
      this.error(
        'FILE_IMAGE_DIMENSIONS_EXCEEDED',
        'The image dimensions exceed the configured pixel limit.',
        413,
      );
    }
    if (error instanceof FileTypeUnsupportedError) {
      this.error(
        'FILE_TYPE_UNSUPPORTED',
        'The file type is not supported.',
        415,
      );
    }
    if (error instanceof FileStorageLowError) {
      this.error(
        'FILE_STORAGE_LOW',
        'The server does not have enough storage.',
        507,
      );
    }
    if (error instanceof FileInputError) {
      this.error('FILE_INPUT_INVALID', 'File input is invalid.', 400);
    }
    throw error;
  }

  private error(code: string, message: string, status: number): never {
    throw new HttpException({ error: { code, message } }, status);
  }
}
