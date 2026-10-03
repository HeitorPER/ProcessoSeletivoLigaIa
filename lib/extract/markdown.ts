import type { MarkdownDoc, Section } from '@/lib/types';
import { normalizeForMatch } from '@/lib/text';
import { parseFrontMatter } from './frontmatter';

export function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1');
}

/** O export `text/markdown` do Google Docs escapa caracteres e usa espaço não separável. */
export function normalizeGoogleDocMarkdown(text: string): string {
  return unescapeMarkdown(text.replace(/ /g, ' '));
}

export function parseMarkdown(raw: string): MarkdownDoc {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const { data } = parseFrontMatter(text);
  const sections: Section[] = [];
  let current: Section = { heading: '', level: 0, text: '', startLine: 1 };
  const buf: string[] = [];
  const flush = () => {
    current.text = buf.join('\n').trim();
    if (current.heading || current.text) sections.push(current);
    buf.length = 0;
  };
  text.split('\n').forEach((line, idx) => {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) {
      flush();
      current = { heading: m[2].trim(), level: m[1].length, text: '', startLine: idx + 1 };
    } else {
      buf.push(line);
    }
  });
  flush();
  return { kind: 'markdown', text, frontMatter: data, sections };
}

export function findSectionFor(doc: MarkdownDoc, excerpt: string): Section | null {
  const needle = normalizeForMatch(excerpt);
  if (!needle) return null;
  return doc.sections.find((s) => normalizeForMatch(s.text).includes(needle)) ?? null;
}

export function stripFrontMatterLines(text: string): string {
  const { bodyStart } = parseFrontMatter(text);
  if (bodyStart === 0) return text;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const head = lines.slice(0, bodyStart).filter((l) => /^#\s/.test(l));
  return [...head, ...lines.slice(bodyStart)].join('\n').trim();
}
