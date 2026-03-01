// ============================================================================
// Database Core
// ============================================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { 
  DatabaseConfig, 
  Schema, 
  ParsedRecord, 
  RecordWithMetadata,
  QueryOptions,
  WhereClause,
  FilterOperator 
} from './types.js';
import { MarkdownDBError, RecordNotFoundError } from './types.js';
import { 
  loadDatabaseSchema, 
  loadTableSchema, 
  validateGlobalSchemaCompliance,
  validateRecord 
} from './schema.js';
import { parseMarkdown, serializeRecord, validateTitleConsistency } from './parser.js';

export class Database {
  public readonly path: string;
  private config: DatabaseConfig | null = null;
  private globalSchema: Schema | null = null;
  private tableSchemas: Map<string, Schema> = new Map();
  private tables: Map<string, Table> = new Map();

  constructor(dbPath: string) {
    this.path = dbPath;
  }

  async init(): Promise<void> {
    // Check if database exists
    const mddbDir = join(this.path, '.mddb');
    const configPath = join(mddbDir, 'config.json');
    
    if (existsSync(configPath)) {
      // Load existing database
      this.config = JSON.parse(readFileSync(configPath, 'utf-8')) as DatabaseConfig;
    } else {
      // Create new database
      mkdirSync(mddbDir, { recursive: true });
      this.config = {
        version: '0.1.0',
        id: randomUUID(),
        createdAt: new Date().toISOString()
      };
      writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    }
    
    // Load global schema
    this.globalSchema = loadDatabaseSchema(this.path);
    
    // Discover and validate tables
    await this.discoverTables();
  }

  static async create(dbPath: string): Promise<Database> {
    const db = new Database(dbPath);
    await db.init();
    return db;
  }

  private async discoverTables(): Promise<void> {
    if (!existsSync(this.path)) {
      throw new MarkdownDBError(`Database path does not exist: ${this.path}`, 'PATH_NOT_FOUND');
    }
    
    const entries = readdirSync(this.path, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      
      const tablePath = join(this.path, entry.name);
      const schemaPath = join(tablePath, 'schema.json');
      
      if (!existsSync(schemaPath)) continue;
      
      // Load and validate table schema
      const tableSchema = loadTableSchema(tablePath);
      validateGlobalSchemaCompliance(
        tableSchema,
        this.globalSchema,
        entry.name,
        tablePath
      );
      
      this.tableSchemas.set(entry.name, tableSchema);
      this.tables.set(entry.name, new Table(this, entry.name, tablePath, tableSchema));
    }
  }

  table(name: string): Table {
    const table = this.tables.get(name);
    if (!table) {
      throw new MarkdownDBError(`Table '${name}' not found`, 'TABLE_NOT_FOUND');
    }
    return table;
  }

  listTables(): string[] {
    return Array.from(this.tables.keys());
  }

  getGlobalSchema(): Schema | null {
    return this.globalSchema;
  }

  getConfig(): DatabaseConfig | null {
    return this.config;
  }

  async createTable(name: string, schema: Schema): Promise<Table> {
    // Validate global schema compliance
    validateGlobalSchemaCompliance(schema, this.globalSchema, name, join(this.path, name));
    
    const tablePath = join(this.path, name);
    
    // Create table directory
    if (!existsSync(tablePath)) {
      mkdirSync(tablePath, { recursive: true });
    }
    
    // Write schema
    const schemaPath = join(tablePath, 'schema.json');
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
    
    // Register table
    this.tableSchemas.set(name, schema);
    const table = new Table(this, name, tablePath, schema);
    this.tables.set(name, table);
    
    return table;
  }
}

export class Table {
  constructor(
    _db: Database,
    public readonly name: string,
    public readonly path: string,
    public readonly schema: Schema
  ) {}

  async findMany(options: QueryOptions = {}): Promise<RecordWithMetadata[]> {
    const records: RecordWithMetadata[] = [];
    const entries = readdirSync(this.path, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.md')) continue;
      if (entry.name === 'schema.json') continue;
      
      try {
        const record = await this.findOne(entry.name.replace(/\.md$/, ''));
        if (record) {
          records.push(record);
        }
      } catch (err) {
        // Skip invalid records
        console.warn(`Skipping invalid record: ${entry.name}`, err);
      }
    }
    
    // Apply filters
    let filtered = records;
    if (options.where) {
      filtered = records.filter(r => matchesWhere(r, options.where!));
    }
    
    // Apply sorting
    if (options.orderBy) {
      filtered = sortRecords(filtered, options.orderBy);
    }
    
    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit;
    
    if (limit !== undefined) {
      return filtered.slice(offset, offset + limit);
    }
    return filtered.slice(offset);
  }

  async findOne(id: string): Promise<RecordWithMetadata | null> {
    const filePath = join(this.path, `${id}.md`);
    
    if (!existsSync(filePath)) {
      return null;
    }
    
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseMarkdown(content, filePath);
    
    // Validate title consistency
    if (parsed.title) {
      validateTitleConsistency(String(parsed.title), `${id}.md`, filePath);
    }
    
    // Validate against schema
    validateRecord(parsed, this.schema, this.name);
    
    return {
      ...parsed,
      _table: this.name,
      _id: id,
      _path: filePath
    };
  }

  async create(id: string, data: ParsedRecord): Promise<RecordWithMetadata> {
    // Check if record already exists
    const existingPath = join(this.path, `${id}.md`);
    if (existsSync(existingPath)) {
      throw new MarkdownDBError(
        `Record '${id}' already exists in table '${this.name}'`,
        'RECORD_EXISTS'
      );
    }
    
    // Set title if not present
    if (!data.title) {
      data.title = id;
    }
    
    // Validate title consistency
    validateTitleConsistency(String(data.title), `${id}.md`, existingPath);
    
    // Validate against schema
    validateRecord(data, this.schema, this.name);
    
    // Serialize and write
    const content = serializeRecord(data, this.schema);
    writeFileSync(existingPath, content);
    
    const result = { ...data } as Record<string, unknown>;
    result._table = this.name;
    result._id = id;
    result._path = existingPath;
    return result as RecordWithMetadata;
  }

  async update(id: string, data: Partial<ParsedRecord>): Promise<RecordWithMetadata> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new RecordNotFoundError(this.name, id);
    }
    
    // Merge data
    const updated = { ...existing, ...data };
    
    // Validate title consistency
    if (updated.title) {
      validateTitleConsistency(String(updated.title), `${id}.md`, existing._path);
    }
    
    // Validate against schema
    validateRecord(updated, this.schema, this.name);
    
    // Serialize and write
    const content = serializeRecord(updated as ParsedRecord, this.schema);
    writeFileSync(existing._path, content);
    
    return updated as unknown as RecordWithMetadata;
  }

  async delete(id: string): Promise<void> {
    const { unlinkSync } = await import('fs');
    const filePath = join(this.path, `${id}.md`);
    
    if (!existsSync(filePath)) {
      throw new RecordNotFoundError(this.name, id);
    }
    
    unlinkSync(filePath);
  }

  async count(options: Pick<QueryOptions, 'where'> = {}): Promise<number> {
    const records = await this.findMany(options);
    return records.length;
  }
}

// ============================================================================
// Query Helpers
// ============================================================================

function matchesWhere(record: RecordWithMetadata, where: WhereClause): boolean {
  for (const [field, condition] of Object.entries(where)) {
    if (!matchesCondition(record[field], condition)) {
      return false;
    }
  }
  return true;
}

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (condition === null) {
    return value === null || value === undefined;
  }
  
  if (condition === undefined) {
    return value === undefined;
  }
  
  // Check if condition is a filter operator
  if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
    const op = condition as FilterOperator;
    
    if ('eq' in op) return value === op.eq;
    if ('ne' in op) return value !== op.ne;
    if ('gt' in op) return typeof value === 'number' && typeof op.gt === 'number' && value > op.gt;
    if ('gte' in op) return typeof value === 'number' && typeof op.gte === 'number' && value >= op.gte;
    if ('lt' in op) return typeof value === 'number' && typeof op.lt === 'number' && value < op.lt;
    if ('lte' in op) return typeof value === 'number' && typeof op.lte === 'number' && value <= op.lte;
    if ('contains' in op) return typeof value === 'string' && typeof op.contains === 'string' && value.includes(op.contains);
    if ('startsWith' in op) return typeof value === 'string' && typeof op.startsWith === 'string' && value.startsWith(op.startsWith);
    if ('endsWith' in op) return typeof value === 'string' && typeof op.endsWith === 'string' && value.endsWith(op.endsWith);
    if ('in' in op && Array.isArray(op.in)) return op.in.includes(value);
    
    return false;
  }
  
  // Direct equality
  return value === condition;
}

function sortRecords(
  records: RecordWithMetadata[], 
  orderBy: Record<string, 'asc' | 'desc'>
): RecordWithMetadata[] {
  return [...records].sort((a, b) => {
    for (const [field, direction] of Object.entries(orderBy)) {
      const aVal = a[field];
      const bVal = b[field];
      
      if (aVal === undefined && bVal === undefined) continue;
      if (aVal === undefined) return direction === 'asc' ? 1 : -1;
      if (bVal === undefined) return direction === 'asc' ? -1 : 1;
      
      if (aVal !== null && bVal !== null) {
        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      }
    }
    return 0;
  });
}
