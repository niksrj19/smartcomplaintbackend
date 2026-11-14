import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LLM_PROVIDER, type LlmProvider } from '../../../../ports/llm.provider.js';
import { complaintDraftSchema } from '../../../../shared/schemas/complaint-draft.schema.js';
import { type DraftFields, REQUIRED_DRAFT_FIELDS } from '../../agent.types.js';
import { EXTRACT_PROMPT } from '../../prompts/agent.prompts.js';
import { type AgentStateType, type AgentStateUpdate, recentMessages } from '../agent.state.js';

/** Lenient on purpose (nullish) — models send null for unknowns. Strict checks happen per field below. */
const extractionSchema = z.object({
  citizenName: z.string().nullish(),
  citizenEmail: z.string().nullish(),
  citizenPhone: z.string().nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  address: z.string().nullish(),
});

const FIELD_LABELS: Record<string, string> = {
  citizenName: 'your name',
  citizenEmail: 'your email address',
  citizenPhone: 'phone number',
  title: 'a short summary of the issue',
  description: 'a description of the issue',
  address: 'the location of the issue',
};

/** Node 3 — pulls complaint details out of the conversation and validates each field. */
@Injectable()
export class ExtractDetailsNode {
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  async run(state: AgentStateType): Promise<AgentStateUpdate> {
    // Signed-in citizen: email comes from Google (verified, can't be changed in chat); name is a default they can correct
    const known: DraftFields = { ...state.draft };
    if (state.citizenProfile) {
      known.citizenEmail = state.citizenProfile.email;
      known.citizenName ??= state.citizenProfile.name;
    }

    const extracted = await this.llm.generateStructured(
      [{ role: 'system', content: EXTRACT_PROMPT(known) }, ...recentMessages(state, 16)],
      extractionSchema,
      { temperature: 0 },
    );

    const draft: DraftFields = { ...known };
    const invalidFields: string[] = [];

    for (const [key, value] of Object.entries(extracted)) {
      if (value === null || value === undefined || String(value).trim() === '') continue;
      if (key === 'citizenEmail' && state.citizenProfile) continue; // verified email always wins
      const field = key as keyof typeof extractionSchema.shape;
      // Validate with the same rules as the final draft schema
      const check = complaintDraftSchema.shape[field].safeParse(String(value).trim());
      if (check.success) {
        (draft as Record<string, unknown>)[field] = check.data;
      } else {
        invalidFields.push(FIELD_LABELS[field] ?? field);
      }
    }
    return { draft, invalidFields };
  }

  static missingFields(draft: DraftFields): string[] {
    return REQUIRED_DRAFT_FIELDS.filter((f) => !draft[f]).map((f) => FIELD_LABELS[f]);
  }
}
