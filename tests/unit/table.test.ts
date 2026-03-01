import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { loadFixture, loadTempFixture, cleanupTempFixtures } from '../utils.js';
import type { Database } from '../../packages/core/dist/index.js';

describe('Table', () => {
  afterAll(() => {
    cleanupTempFixtures();
  });

  describe('findMany', () => {
    it('should find all records', async () => {
      const db = await loadFixture('minimal');
      const table = db.table('posts');
      const records = await table.findMany();
      expect(records).toHaveLength(2);
    });

    it('should apply limit', async () => {
      const db = await loadFixture('minimal');
      const table = db.table('posts');
      const records = await table.findMany({ limit: 1 });
      expect(records).toHaveLength(1);
    });

    it('should apply offset', async () => {
      const db = await loadFixture('minimal');
      const table = db.table('posts');
      const all = await table.findMany();
      const offset = await table.findMany({ offset: 1 });
      expect(offset).toHaveLength(all.length - 1);
    });

    it('should apply orderBy', async () => {
      const db = await loadFixture('minimal');
      const table = db.table('posts');
      const records = await table.findMany({ 
        orderBy: { created_at: 'desc' } 
      });
      expect(new Date(records[0].created_at as string).getTime()).toBeGreaterThan(
        new Date(records[1].created_at as string).getTime()
      );
    });
  });

  describe('findOne', () => {
    it('should find existing record', async () => {
      const db = await loadFixture('minimal');
      const table = db.table('posts');
      const record = await table.findOne('hello-world');
      expect(record).toBeDefined();
      expect(record!._id).toBe('hello-world');
      expect(record!.title).toBe('hello-world');
    });

    it('should return null for non-existent record', async () => {
      const db = await loadFixture('minimal');
      const table = db.table('posts');
      const record = await table.findOne('nonexistent');
      expect(record).toBeNull();
    });
  });

  describe('CRUD Operations', () => {
    it('should create a record', async () => {
      const { db, cleanup } = await loadTempFixture('minimal');
      const table = db.table('posts');
      
      const record = await table.create('new-post', {
        title: 'new-post',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        published: true,
        'content-## Body': 'New post content'
      });
      
      expect(record._id).toBe('new-post');
      expect(record.title).toBe('new-post');
      
      cleanup();
    });

    it('should update a record', async () => {
      const { db, cleanup } = await loadTempFixture('minimal');
      const table = db.table('posts');
      
      const updated = await table.update('hello-world', {
        published: false
      });
      
      expect(updated.published).toBe(false);
      
      // Verify persisted
      const found = await table.findOne('hello-world');
      expect(found!.published).toBe(false);
      
      cleanup();
    });

    it('should delete a record', async () => {
      const { db, cleanup } = await loadTempFixture('minimal');
      const table = db.table('posts');
      
      await table.delete('hello-world');
      
      const found = await table.findOne('hello-world');
      expect(found).toBeNull();
      
      cleanup();
    });

    it('should throw when creating duplicate record', async () => {
      const { db, cleanup } = await loadTempFixture('minimal');
      const table = db.table('posts');
      
      expect(async () => {
        await table.create('hello-world', {
          title: 'hello-world',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }).toThrow();
      
      cleanup();
    });
  });

  describe('count', () => {
    it('should count all records', async () => {
      const db = await loadFixture('minimal');
      const table = db.table('posts');
      const count = await table.count();
      expect(count).toBe(2);
    });
  });
});
