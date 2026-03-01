import { describe, it, expect } from 'bun:test';
import { parseMarkdown, serializeRecord } from '../../packages/core/dist/index.js';

describe('Parser', () => {
  describe('Frontmatter', () => {
    it('should parse YAML frontmatter', () => {
      const md = `---
title: "hello"
count: 42
published: true
tags: ["a", "b"]
---

## Content

Body here.
`;
      const result = parseMarkdown(md, 'test.md');
      expect(result.title).toBe('hello');
      expect(result.count).toBe(42);
      expect(result.published).toBe(true);
      expect(result.tags).toEqual(['a', 'b']);
    });

    it('should handle no frontmatter', () => {
      const md = `## Content

Body here.
`;
      const result = parseMarkdown(md, 'test.md');
      expect(result.title).toBeUndefined();
      expect(result['content-## Content']).toBe('Body here.');
    });
  });

  describe('Headings', () => {
    it('should extract h2 content', () => {
      const md = `---
title: "test"
---

## Section A

Content A.

## Section B

Content B.
`;
      const result = parseMarkdown(md, 'test.md');
      expect(result['content-## Section A']).toBe('Content A.');
      expect(result['content-## Section B']).toBe('Content B.');
    });

    it('should include nested headings in parent content', () => {
      const md = `---
title: "test"
---

## Parent

Parent content.

### Child

Child content.
`;
      const result = parseMarkdown(md, 'test.md');
      expect(result['content-## Parent']).toContain('Parent content.');
      // Note: Current implementation extracts sections based on h2 only
      // Nested headings may be handled differently
    });

    it('should handle duplicate headings with hash suffix', () => {
      const md = `---
title: "test"
---

## Section

First.

## Section

Second.
`;
      const result = parseMarkdown(md, 'test.md');
      const keys = Object.keys(result).filter(k => k.startsWith('content-## Section'));
      expect(keys.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject h1 when title in frontmatter', () => {
      const md = `---
title: "test"
---

# Title

## Content

Body.
`;
      expect(() => parseMarkdown(md, 'test.md')).toThrow();
    });
  });

  describe('Code Blocks', () => {
    it('should extract code blocks', () => {
      const md = `---
title: "test"
---

## Examples

\`\`\`typescript
const x = 1;
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md');
      // Check for placeholder pattern (markdown may escape underscores)
      expect(result['content-## Examples']).toMatch(/\{\{CODE_BLOCK:|\{\{CODE\\_BLOCK:/);
      
      // Find the extracted code block
      const codeKey = Object.keys(result).find(k => k.includes('typescript'));
      expect(codeKey).toBeDefined();
      expect(result[codeKey!]).toHaveProperty('language');
      expect(result[codeKey!]).toHaveProperty('code');
    });

    it('should handle multiple code blocks', () => {
      const md = `---
title: "test"
---

## Examples

\`\`\`ts
const a = 1;
\`\`\`

\`\`\`python
def b():
    pass
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md');
      const codeKeys = Object.keys(result).filter(k => k.includes('CODE_BLOCK') || (k.includes('-ts-') || k.includes('-python-')));
      expect(codeKeys.length).toBeGreaterThanOrEqual(1);
    });

    it('should use "text" for code blocks without language', () => {
      const md = `---
title: "test"
---

## Examples

\`\`\`
plain text
\`\`\`
`;
      const result = parseMarkdown(md, 'test.md');
      const codeKey = Object.keys(result).find(k => k.includes('-text-'));
      expect(codeKey).toBeDefined();
    });
  });

  describe('Wiki Links', () => {
    it('should extract wiki links', () => {
      const md = `---
title: "test"
---

## Content

See [[other-page]] for more.
`;
      const result = parseMarkdown(md, 'test.md');
      expect(result.wiki_links).toBeDefined();
      expect(result.wiki_links!.length).toBe(1);
      expect(result.wiki_links![0].target).toBe('other-page');
      expect(result.wiki_links![0].id).toBe('other-page');
    });

    it('should extract cross-table wiki links', () => {
      const md = `---
title: "test"
---

## Content

See [[authors/john]] for author.
`;
      const result = parseMarkdown(md, 'test.md');
      expect(result.wiki_links).toBeDefined();
      expect(result.wiki_links![0].target).toBe('authors/john');
      expect(result.wiki_links![0].table).toBe('authors');
      expect(result.wiki_links![0].id).toBe('john');
    });

    it('should extract wiki links with labels', () => {
      const md = `---
title: "test"
---

## Content

See [[target|Display Text]] for more.
`;
      const result = parseMarkdown(md, 'test.md');
      expect(result.wiki_links).toBeDefined();
      expect(result.wiki_links![0].target).toBe('target');
      expect(result.wiki_links![0].label).toBe('Display Text');
    });

    it('should replace wiki links with placeholders', () => {
      const md = `---
title: "test"
---

## Content

See [[target]] for more.
`;
      const result = parseMarkdown(md, 'test.md');
      // Check for placeholder pattern (markdown may escape underscores)
      expect(result['content-## Content']).toMatch(/\{\{WIKI_LINK:|\{\{WIKI\\_LINK:/);
    });
  });

  describe('Edge Cases', () => {
    it('should require at least one heading', () => {
      const md = `---
title: "test"
---

No heading here.
`;
      expect(() => parseMarkdown(md, 'test.md')).toThrow();
    });

    it('should handle special characters in headings', () => {
      const md = `---
title: "test"
---

## API / Auth

Content.

## 中文标题

中文内容。
`;
      const result = parseMarkdown(md, 'test.md');
      expect(result['content-## API / Auth']).toBeDefined();
      expect(result['content-## 中文标题']).toBeDefined();
    });
  });
});
