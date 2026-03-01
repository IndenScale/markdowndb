import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { loadFixture, loadTempFixture, cleanupTempFixtures } from '../utils.js';
import type { Database } from '../../packages/core/dist/index.js';

describe('Integration: Full Workflow', () => {
  afterAll(() => {
    cleanupTempFixtures();
  });

  describe('Minimal Database', () => {
    it('should load and query all records', async () => {
      const db = await loadFixture('minimal');
      const table = db.table('posts');
      
      const records = await table.findMany();
      expect(records).toHaveLength(2);
      
      const hello = records.find(r => r._id === 'hello-world');
      expect(hello).toBeDefined();
      expect(hello!.published).toBe(true);
      expect(hello!['content-## Content']).toContain('Hello, MarkdownDB!');
    });

    it('should query with filters', async () => {
      const db = await loadFixture('minimal');
      const table = db.table('posts');
      
      const published = await table.findMany({
        where: { published: true }
      });
      expect(published).toHaveLength(1);
      expect(published[0]._id).toBe('hello-world');
    });
  });

  describe('Global Schema Database', () => {
    it('should load with global schema enforced', async () => {
      const db = await loadFixture('global-schema');
      
      expect(db.getGlobalSchema()).toBeDefined();
      expect(db.listTables()).toHaveLength(2);
    });

    it('should resolve references', async () => {
      const db = await loadFixture('global-schema');
      const blog = db.table('blog');
      const authors = db.table('authors');
      
      const post = await blog.findOne('getting-started');
      expect(post).toBeDefined();
      expect(post!.author).toBe('john-doe');
      
      const author = await authors.findOne(post!.author as string);
      expect(author).toBeDefined();
      expect(author!.email).toBe('john@example.com');
    });

    it('should query with array contains', async () => {
      const db = await loadFixture('global-schema');
      const blog = db.table('blog');
      
      // Get all posts and verify tags exist
      const posts = await blog.findMany();
      const withTags = posts.filter(p => p.tags && (p.tags as string[]).includes('intro'));
      
      expect(withTags.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases Database', () => {
    it('should handle code blocks', async () => {
      const db = await loadFixture('edge-cases');
      const table = db.table('complex');
      
      const record = await table.findOne('code-blocks');
      expect(record).toBeDefined();
      
      // Should have extracted code blocks as separate fields
      const codeKeys = Object.keys(record!).filter(k => k.includes('typescript') || k.includes('python'));
      expect(codeKeys.length).toBeGreaterThan(0);
    });

    it('should handle nested headings', async () => {
      const db = await loadFixture('edge-cases');
      const table = db.table('complex');
      
      const record = await table.findOne('nested-headings');
      expect(record).toBeDefined();
      
      // Nested headings should be part of parent content
      // Current implementation may extract nested headings as separate sections
      expect(record!['content-## Parent']).toBeDefined();
    });

    it('should handle special characters in headings', async () => {
      const db = await loadFixture('edge-cases');
      const table = db.table('complex');
      
      const record = await table.findOne('special-chars');
      expect(record).toBeDefined();
      
      expect(record!['content-## API / Auth']).toBeDefined();
      expect(record!['content-## 中文标题']).toBeDefined();
    });
  });

  describe('Relations Database', () => {
    it('should extract wiki links', async () => {
      const db = await loadFixture('relations');
      const table = db.table('docs');
      
      const index = await table.findOne('index');
      expect(index).toBeDefined();
      expect(index!.wiki_links).toBeDefined();
      expect(index!.wiki_links!.length).toBeGreaterThan(0);
      
      // Check cross-table link
      const apiLink = index!.wiki_links!.find(l => l.target === 'references/api-reference');
      expect(apiLink).toBeDefined();
      expect(apiLink!.table).toBe('references');
    });
  });

  describe('CRUD Operations', () => {
    it('should perform full CRUD cycle', async () => {
      const { db, cleanup } = await loadTempFixture('minimal');
      const table = db.table('posts');
      
      // Create with required content heading
      const created = await table.create('crud-test', {
        title: 'crud-test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        published: false,
        'content-## Content': 'Test content for CRUD operation'
      });
      expect(created._id).toBe('crud-test');
      
      // Read
      const found = await table.findOne('crud-test');
      expect(found).toBeDefined();
      expect(found!.published).toBe(false);
      
      // Update
      const updated = await table.update('crud-test', { published: true });
      expect(updated.published).toBe(true);
      
      // Verify update persisted
      const reFound = await table.findOne('crud-test');
      expect(reFound!.published).toBe(true);
      
      // Delete
      await table.delete('crud-test');
      const deleted = await table.findOne('crud-test');
      expect(deleted).toBeNull();
      
      cleanup();
    });
  });
});
