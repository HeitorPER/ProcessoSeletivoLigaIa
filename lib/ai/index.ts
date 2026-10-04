import { createOpenAIProvider } from './openai';
import { createRuleBasedProvider } from './rules';
import type { AIProvider } from './types';

export type { AIProvider, ExtractionInput, RawExtractionItem } from './types';
export { AIError } from './types';

export function getProvider(env: NodeJS.ProcessEnv = process.env): AIProvider {
  const kind = (env.AI_PROVIDER ?? 'none').toLowerCase();
  if (kind === 'openai') {
    if (!env.OPENAI_API_KEY) {
      console.warn('[ia] AI_PROVIDER=openai sem OPENAI_API_KEY; usando extração por regras');
      return createRuleBasedProvider();
    }
    return createOpenAIProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-6-luna' });
  }
  return createRuleBasedProvider();
}
