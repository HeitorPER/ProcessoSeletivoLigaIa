import type { ExtractedDoc, FetchedContent } from '@/lib/types';
import { parseMarkdown } from './markdown';
import { extractPdfText } from './pdf';
import { parseXlsx } from './xlsx';

export class ExtractError extends Error {}

export async function extractDoc(content: Exclude<FetchedContent, { format: 'unsupported' }>): Promise<ExtractedDoc> {
  switch (content.format) {
    case 'markdown':
      return parseMarkdown(content.text);
    case 'xlsx':
      try {
        return parseXlsx(content.buffer);
      } catch (e) {
        throw new ExtractError(`Planilha ilegível: ${(e as Error).message}`);
      }
    case 'pdf': {
      let text: string;
      try {
        text = await extractPdfText(content.buffer);
      } catch (e) {
        throw new ExtractError(`PDF ilegível: ${(e as Error).message}`);
      }
      if (!text) throw new ExtractError('PDF sem texto extraível (provavelmente digitalizado) — OCR está fora do escopo');
      return parseMarkdown(text);
    }
  }
}

/** Texto técnico guardado em `Source.extractedText`. Planilhas são guardadas como JSON. */
export function docToStoredText(doc: ExtractedDoc): string {
  return doc.kind === 'markdown' ? doc.text : JSON.stringify(doc);
}

export function storedTextToDoc(text: string): ExtractedDoc {
  if (text.startsWith('{"kind":"spreadsheet"')) return JSON.parse(text) as ExtractedDoc;
  return parseMarkdown(text);
}
