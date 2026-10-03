import OpenAI from 'openai';
import { buildExtractionUserPrompt, EXTRACTION_SYSTEM_PROMPT, SUMMARY_SYSTEM_PROMPT } from './prompts';
import { EXTRACTION_JSON_SCHEMA, extractionResponseSchema } from './schema';
import { AIError, type AIProvider } from './types';

interface ResponseLike {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output_text?: string;
  output?: Array<{ type: string; content?: Array<{ type: string; refusal?: string }> }>;
}
/** Subconjunto do SDK usado aqui — permite injetar um cliente falso nos testes. */
export type ResponsesClient = { responses: { create(body: Record<string, unknown>): Promise<ResponseLike> } };

function findRefusal(response: ResponseLike): string | null {
  for (const out of response.output ?? []) {
    if (out.type !== 'message') continue;
    for (const c of out.content ?? []) if (c.type === 'refusal') return c.refusal ?? 'sem detalhe';
  }
  return null;
}

export function createOpenAIProvider(opts: { apiKey: string; model: string; client?: ResponsesClient }): AIProvider {
  const client: ResponsesClient = opts.client ?? (new OpenAI({ apiKey: opts.apiKey }) as unknown as ResponsesClient);
  return {
    name: `openai:${opts.model}`,
    async extract(input) {
      const response = await client.responses.create({
        model: opts.model,
        reasoning: { effort: 'low' },
        instructions: EXTRACTION_SYSTEM_PROMPT,
        input: buildExtractionUserPrompt(input),
        text: { format: { type: 'json_schema', name: 'sugestoes_de_atividades', strict: true, schema: EXTRACTION_JSON_SCHEMA } },
      });
      if (response.status === 'incomplete') {
        throw new AIError(`Resposta incompleta do modelo (${response.incomplete_details?.reason ?? 'motivo desconhecido'})`);
      }
      const refusal = findRefusal(response);
      if (refusal) throw new AIError(`O modelo recusou a análise: ${refusal}`);
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.output_text ?? '');
      } catch {
        throw new AIError('Resposta do modelo não é JSON válido');
      }
      const result = extractionResponseSchema.safeParse(parsed);
      if (!result.success) throw new AIError('Resposta do modelo fora do formato esperado');
      return result.data.items;
    },
    async summarize(facts) {
      const response = await client.responses.create({
        model: opts.model,
        reasoning: { effort: 'none' },
        instructions: SUMMARY_SYSTEM_PROMPT,
        input: facts,
      });
      const text = response.output_text?.trim();
      return text ? text : null;
    },
  };
}
