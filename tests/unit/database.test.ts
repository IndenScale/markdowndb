import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { loadFixture, loadTempFixture, cleanupTempFixtures } from '../utils.js';
import type { Database, Table } from '../../packages/core/dist/index.js';

describe('Database', () => {
  afterAll(() => {
    cleanupTempFixtures();
  });

  describe('Initialization', () => {
    it('should load minimal fixture', async () => {
      const db = await loadFixture('minimal');
      expect(db).toBeDefined();
      expect(db.listTables()).toContain('posts');
    });

    it('should load global-schema fixture', async () => {
      const db = await loadFixture('global-schema');
      expect(db).toBeDefined();
      expect(db.getGlobalSchema()).toBeDefined();
      expect(db.listTables()).toContain('blog');
      expect(db.listTables()).toContain('authors');
    });

    it('should load edge-cases fixture', async () => {
      const db = await loadFixture('edge-cases');
      expect(db).toBeDefined();
      expect(db.listTables()).toContain('complex');
    });

    it('should load relations fixture', async () => {
      const db = await loadFixture('relations');
      expect(db).toBeDefined();
      expect(db.listTables()).toContain('docs');
      expect(db.listTables()).toContain('references');
    });
  });

  describe('Table Access', () => {
    it('should get table by name', async () => {
      const db = await loadFixture('minimal');
      const table = db.table('posts');
      expect(table).toBeDefined();
      expect(table.name).toBe('posts');
    });

    it('should throw for non-existent table', async () => {
      const db = await loadFixture('minimal');
      expect(() => db.table('nonexistent')).toThrow();
    });

    it('should list all tables', async () => {
      const db = await loadFixture('global-schema');
      const tables = db.listTables();
      expect(tables).toHaveLength(2);
      expect(tables).toContain('blog');
      expect(tables).toContain('authors');
    });
  });

  describe('Schema Access', () => {
    it('should get global schema', async () => {
      const db = await loadFixture('global-schema');
      const schema = db.getGlobalSchema();
      expect(schema).toBeDefined();
      expect(schema!.fields.title).toBeDefined();
      expect(schema!.fields.title.required).toBe(true);
    });

    it('should return null for no global schema', async () => {
      const db = await loadFixture('minimal');
      expect(db.getGlobalSchema()).toBeNull();
    });
  });
});
