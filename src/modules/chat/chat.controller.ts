import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { CitizenPrincipal } from '../auth-core/auth-core.types.js';
import { CitizenAuth, CurrentCitizen } from '../auth-core/decorators/auth.decorators.js';
import { type ChatSessionSummary, ChatService } from './chat.service.js';
import {
  type ChatTurnResponse,
  type SendMessageDto,
  type SubmitDraftDto,
  draftIdSchema,
  sendMessageSchema,
  sessionIdSchema,
  submitDraftSchema,
} from './dto/chat.schemas.js';

/**
 * Citizen chat API — Google sign-in required for EVERY route.
 * A citizen can only see and use their own sessions.
 */
@CitizenAuth()
@Controller('chat/sessions')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  start(@CurrentCitizen() citizen: CitizenPrincipal): Promise<ChatTurnResponse> {
    return this.chat.startSession(citizen);
  }

  @Get()
  list(@CurrentCitizen() citizen: CitizenPrincipal): Promise<ChatSessionSummary[]> {
    return this.chat.listSessions(citizen);
  }

  @Get(':sessionId/messages')
  history(
    @CurrentCitizen() citizen: CitizenPrincipal,
    @Param('sessionId', new ZodValidationPipe(sessionIdSchema)) sessionId: string,
  ): Promise<ChatTurnResponse> {
    return this.chat.history(citizen, sessionId);
  }

  @Post(':sessionId/messages')
  @HttpCode(HttpStatus.OK)
  send(
    @CurrentCitizen() citizen: CitizenPrincipal,
    @Param('sessionId', new ZodValidationPipe(sessionIdSchema)) sessionId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ): Promise<ChatTurnResponse> {
    return this.chat.sendMessage(citizen, sessionId, dto);
  }

  @Post(':sessionId/drafts/:draftId/submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @CurrentCitizen() citizen: CitizenPrincipal,
    @Param('sessionId', new ZodValidationPipe(sessionIdSchema)) sessionId: string,
    @Param('draftId', new ZodValidationPipe(draftIdSchema)) draftId: string,
    @Body(new ZodValidationPipe(submitDraftSchema)) dto: SubmitDraftDto,
  ): Promise<ChatTurnResponse> {
    return this.chat.submitDraft(citizen, sessionId, draftId, dto.idempotencyKey);
  }

  @Post(':sessionId/drafts/:draftId/discard')
  @HttpCode(HttpStatus.OK)
  discard(
    @CurrentCitizen() citizen: CitizenPrincipal,
    @Param('sessionId', new ZodValidationPipe(sessionIdSchema)) sessionId: string,
    @Param('draftId', new ZodValidationPipe(draftIdSchema)) draftId: string,
  ): Promise<ChatTurnResponse> {
    return this.chat.discardDraft(citizen, sessionId, draftId);
  }
}
