// ============================================================================
// Markdown Parser - Convert Markdown to Object
// ============================================================================

import { createHash } from 'crypto';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { toString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import type { Root, Heading, Code, Paragraph, Node } from 'mdast';
import YAML from 'yaml';
import type { ParsedRecord, CodeBlock, WikiLink } from './types.js';
import { ValidationError } from './types.js';

interface HeadingSection {
  heading: string;
  level: number;
  content: Node[];
}

export interface ParseOptions {
  requireHeading?: boolean;
}

export function parseMarkdown(
  content: string,
  filePath: string,
  options: ParseOptions = {}
): ParsedRecord {
  const { requireHeading = true } = options;
  
  // Parse frontmatter
  const { frontmatter, body } = extractFrontmatter(content);
  
  // Parse AST
  const ast = fromMarkdown(body);
  
  // Validate no h1 if title in frontmatter
  if (frontmatter.title) {
    validateNoH1(ast, filePath);
  }
  
  // Extract sections
  const sections = extractSections(ast);
  
  if (requireHeading && sections.length === 0) {
    throw new ValidationError(
      `Markdown file must contain at least one heading`,
      [`File: ${filePath}`]
    );
  }
  
  // Build result object
  const result = { ...frontmatter } as Record<string, unknown>;
  const wikiLinks: WikiLink[] = [];
  
  for (const section of sections) {
    const fieldName = `content-## ${section.heading}`;
    const processed = processSectionContent(section.content, wikiLinks);
    
    // Handle duplicate headings with hash suffix
    let finalFieldName = fieldName;
    if (result[fieldName] !== undefined) {
      const hash = createHash('sha256')
        .update(processed.text)
        .digest('hex')
        .slice(0, 6);
      finalFieldName = `${fieldName}-${hash}`;
    }
    
    result[finalFieldName] = processed.text;
    
    // Add extracted code blocks
    for (const [key, codeBlock] of Object.entries(processed.codeBlocks)) {
      result[key] = codeBlock;
    }
  }
  
  if (wikiLinks.length > 0) {
    result.wiki_links = wikiLinks;
  }
  
  return result as ParsedRecord;
}

function extractFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  
  try {
    const frontmatter = YAML.parse(match[1]) as Record<string, unknown> || {};
    const body = content.slice(match[0].length);
    return { frontmatter, body };
  } catch (err) {
    return { frontmatter: {}, body: content };
  }
}

function validateNoH1(ast: Root, filePath: string): void {
  let hasH1 = false;
  visit(ast, 'heading', (node: Heading) => {
    if (node.depth === 1) {
      hasH1 = true;
    }
  });
  
  if (hasH1) {
    throw new ValidationError(
      `Cannot have h1 heading when 'title' is in frontmatter`,
      [`File: ${filePath}`]
    );
  }
}

function extractSections(ast: Root): HeadingSection[] {
  const sections: HeadingSection[] = [];
  let currentSection: HeadingSection | null = null;
  
  for (const node of ast.children) {
    if (node.type === 'heading') {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }
      
      // Start new section
      const headingNode = node as Heading;
      currentSection = {
        heading: toString(headingNode),
        level: headingNode.depth,
        content: []
      };
    } else if (currentSection) {
      currentSection.content.push(node);
    }
  }
  
  // Don't forget the last section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections;
}

interface ProcessedContent {
  text: string;
  codeBlocks: Record<string, CodeBlock>;
}

function processSectionContent(nodes: Node[], wikiLinks: WikiLink[]): ProcessedContent {
  const codeBlocks: Record<string, CodeBlock> = {};

  
  // Clone nodes to avoid modifying original
  const clonedNodes = structuredClone(nodes) as Node[];
  
  // Process code blocks and wiki links in the cloned nodes
  visit({ type: 'root', children: clonedNodes } as Root, (node, index, parent) => {
    // Extract code blocks
    if (node.type === 'code') {
      const codeNode = node as Code;
      const language = codeNode.lang || 'text';
      const code = codeNode.value || '';
      const hash = createHash('sha256').update(code).digest('hex').slice(0, 6);
      const placeholder = `{{CODE_BLOCK:${language}-${hash}}}`;
      
      codeBlocks[`content-## ${getSectionHeading(parent)}-${language}-${hash}`] = {
        language,
        code
      };
      
      // Replace with placeholder text node
      if (parent && typeof index === 'number') {
        (parent.children as Node[])[index] = {
          type: 'paragraph',
          children: [{ type: 'text', value: placeholder }]
        } as Paragraph;
      }
    }
    
    // Process wiki links in text
    if (node.type === 'text' || node.type === 'inlineCode') {
      const textNode = node as { value: string };
      const result = processWikiLinks(textNode.value, wikiLinks);
      if (result !== textNode.value) {
        textNode.value = result;
      }
    }
    
    if (node.type === 'link') {
      // Handle regular markdown links if needed
    }
  });
  
  // Convert back to markdown
  const text = toMarkdown({ type: 'root', children: clonedNodes } as Root).trim();
  
  return { text, codeBlocks };
}

function getSectionHeading(_parent: Node | null | undefined): string {
  // This is a simplification - in practice we'd track the current section heading
  return 'section';
}

const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

function processWikiLinks(text: string, wikiLinks: WikiLink[]): string {
  return text.replace(WIKI_LINK_REGEX, (_match, target, label) => {
    const parts = target.split('/');
    let table: string;
    let id: string;
    
    if (parts.length === 1) {
      // Same table reference: [[id]]
      table = '';
      id = parts[0];
    } else {
      // Cross table reference: [[table/id]]
      table = parts[0];
      id = parts.slice(1).join('/');
    }
    
    wikiLinks.push({
      target,
      table: table || '',
      id,
      label: label || id
    });
    
    return `{{WIKI_LINK:${target}${label ? `|${label}` : ''}}}`;
  });
}

export function serializeRecord(
  record: ParsedRecord,
  _tableSchema: { fields: Record<string, { type: string }> }
): string {
  // Separate frontmatter fields from content fields
  const frontmatter: Record<string, unknown> = {};
  const contentFields: Record<string, string | CodeBlock> = {};
  
  for (const [key, value] of Object.entries(record)) {
    if (key === 'wiki_links') continue;
    
    if (key.startsWith('content-##')) {
      contentFields[key] = value as string | CodeBlock;
    } else {
      frontmatter[key] = value;
    }
  }
  
  // Build frontmatter YAML
  let result = '---\n';
  result += YAML.stringify(frontmatter);
  result += '---\n\n';
  
  // Build content sections
  const sortedFields = Object.entries(contentFields).sort((a, b) => {
    // Sort by original order or alphabetically
    return a[0].localeCompare(b[0]);
  });
  
  for (const [fieldName, value] of sortedFields) {
    const heading = fieldName.replace('content-## ', '');
    // Remove hash suffix if present
    const cleanHeading = heading.replace(/-[a-f0-9]{6}$/, '');
    
    result += `## ${cleanHeading}\n\n`;
    
    if (typeof value === 'string') {
      // Replace placeholders back to actual content
      result += restorePlaceholders(value, record);
    }
    
    result += '\n\n';
  }
  
  return result.trim();
}

function restorePlaceholders(text: string, record: ParsedRecord): string {
  // Restore code block placeholders
  let result = text.replace(/\{\{CODE_BLOCK:([^}]+)\}\}/g, (match, placeholder) => {
    const [language, hash] = placeholder.split('-');
    // Find the corresponding code block in record
    for (const [key, value] of Object.entries(record)) {
      if (key.includes(`-${language}-${hash}`) && typeof value === 'object' && value !== null) {
        const codeBlock = value as CodeBlock;
        return `
\`\`\`${codeBlock.language}
${codeBlock.code}
\`\`\`
`;
      }
    }
    return match;
  });
  
  // Restore wiki link placeholders
  result = result.replace(/\{\{WIKI_LINK:([^}|]+)(?:\|([^}]*))?\}\}/g, (_match, target, label) => {
    if (label) {
      return `[[${target}|${label}]]`;
    }
    return `[[${target}]]`;
  });
  
  return result;
}

export function validateTitleConsistency(
  title: string,
  filename: string,
  filePath: string
): void {
  // Remove .md extension from filename
  const baseName = filename.replace(/\.md$/, '');
  
  if (title !== baseName) {
    throw new ValidationError(
      `Title must match filename`,
      [`Title: "${title}"`, `Filename: "${baseName}.md"`, `File: ${filePath}`]
    );
  }
}
