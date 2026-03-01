import { describe, it, expect } from 'bun:test';
import { loadSchema, validateRecord, validateGlobalSchemaCompliance, coerceValue } from '../../packages/core/dist/index.js';
import type { Schema } from '../../packages/core/dist/index.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Schema', () => {
  describe('loadSchema', () => {
    it('should load schema from file', () => {
      const schemaPath = join(__dirname, '../fixtures/minimal/posts/schema.json');
      const schema = loadSchema(schemaPath);
      expect(schema).toBeDefined();
      expect(schema.name).toBe('posts');
      expect(schema.fields).toBeDefined();
    });

    it('should throw for non-existent file', () => {
      expect(() => loadSchema('/nonexistent/schema.json')).toThrow();
    });

    it('should throw for invalid JSON', () => {
      expect(() => loadSchema('/etc/passwd')).toThrow();
    });
  });

  describe('validateRecord', () => {
    const schema: Schema = {
      name: 'test',
      fields: {
        title: { type: 'string', required: true },
        created_at: { type: 'datetime', required: true },
        updated_at: { type: 'datetime', required: true },
        count: { type: 'number' },
        published: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        metadata: { type: 'object' },
        author: { type: 'reference', table: 'authors' }
      }
    };

    it('should validate valid record', () => {
      const record = {
        title: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      expect(() => validateRecord(record, schema, 'test')).not.toThrow();
    });

    it('should reject missing required field', () => {
      const record = {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      expect(() => validateRecord(record, schema, 'test')).toThrow();
    });

    it('should reject wrong type', () => {
      const record = {
        title: 'test',
        created_at: 'not-a-date',
        updated_at: new Date().toISOString()
      };
      expect(() => validateRecord(record, schema, 'test')).toThrow();
    });

    it('should validate number type', () => {
      const record = {
        title: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        count: 'not-a-number'
      };
      expect(() => validateRecord(record, schema, 'test')).toThrow();
    });

    it('should validate boolean type', () => {
      const record = {
        title: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        published: 'not-a-boolean'
      };
      expect(() => validateRecord(record, schema, 'test')).toThrow();
    });

    it('should validate array items', () => {
      const record = {
        title: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: [1, 2, 3] // Should be strings
      };
      expect(() => validateRecord(record, schema, 'test')).toThrow();
    });
  });

  describe('validateGlobalSchemaCompliance', () => {
    const globalSchema: Schema = {
      fields: {
        title: { type: 'string', required: true },
        created_at: { type: 'datetime', required: true },
        updated_at: { type: 'datetime', required: true }
      }
    };

    it('should pass when table schema complies', () => {
      const tableSchema: Schema = {
        name: 'compliant',
        fields: {
          title: { type: 'string', required: true },
          created_at: { type: 'datetime', required: true },
          updated_at: { type: 'datetime', required: true },
          extra: { type: 'string' }
        }
      };
      expect(() => 
        validateGlobalSchemaCompliance(tableSchema, globalSchema, 'compliant', '/test')
      ).not.toThrow();
    });

    it('should fail when missing global field', () => {
      const tableSchema: Schema = {
        name: 'incomplete',
        fields: {
          title: { type: 'string', required: true },
          created_at: { type: 'datetime', required: true }
          // Missing updated_at
        }
      };
      expect(() => 
        validateGlobalSchemaCompliance(tableSchema, globalSchema, 'incomplete', '/test')
      ).toThrow();
    });

    it('should fail when type mismatches', () => {
      const tableSchema: Schema = {
        name: 'wrong-type',
        fields: {
          title: { type: 'number', required: true }, // Should be string
          created_at: { type: 'datetime', required: true },
          updated_at: { type: 'datetime', required: true }
        }
      };
      expect(() => 
        validateGlobalSchemaCompliance(tableSchema, globalSchema, 'wrong-type', '/test')
      ).toThrow();
    });

    it('should pass when no global schema', () => {
      const tableSchema: Schema = {
        name: 'anything',
        fields: { anything: { type: 'string' } }
      };
      expect(() => 
        validateGlobalSchemaCompliance(tableSchema, null, 'anything', '/test')
      ).not.toThrow();
    });
  });

  describe('coerceValue', () => {
    it('should coerce to string', () => {
      expect(coerceValue(123, 'string')).toBe('123');
      expect(coerceValue(true, 'string')).toBe('true');
    });

    it('should coerce to number', () => {
      expect(coerceValue('123', 'number')).toBe(123);
      expect(coerceValue('abc', 'number')).toBe('abc'); // Falls back to original
    });

    it('should coerce to boolean', () => {
      expect(coerceValue('true', 'boolean')).toBe(true);
      expect(coerceValue(1, 'boolean')).toBe(true);
      expect(coerceValue('false', 'boolean')).toBe(false);
    });

    it('should coerce to datetime', () => {
      const date = new Date('2026-03-01');
      expect(coerceValue(date, 'datetime')).toBe(date.toISOString());
      expect(coerceValue('2026-03-01', 'datetime')).toBe(date.toISOString());
    });
  });
});
