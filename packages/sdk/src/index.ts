// ============================================================================
// MarkdownDB SDK
// ============================================================================

import { 
  Database, 
  Table,
  type ParsedRecord,
  type RecordWithMetadata,
  type QueryOptions,
  type Schema,
  type WhereClause,
  type OrderByClause
} from '@mddb/core';

export { Database, Table } from '@mddb/core';
export type {
  FieldType,
  FieldDefinition,
  Schema,
  CodeBlock,
  WikiLink,
  ParsedRecord,
  RecordWithMetadata,
  FilterOperator,
  FilterValue,
  WhereClause,
  OrderDirection,
  OrderByClause,
  QueryOptions,
  MarkdownDBError,
  ValidationError,
  SchemaError,
  RecordNotFoundError
} from '@mddb/core';

// ============================================================================
// Fluent Query Builder
// ============================================================================

export class QueryBuilder {
  private whereClause: WhereClause = {};
  private orderByClause: OrderByClause = {};
  private limitValue?: number;
  private offsetValue = 0;

  constructor(private table: Table) {}

  where(field: string, value: unknown): this;
  where(field: string, operator: string, value: unknown): this;
  where(clause: WhereClause): this;
  where(
    fieldOrClause: string | WhereClause,
    operatorOrValue?: string | unknown,
    value?: unknown
  ): this {
    if (typeof fieldOrClause === 'object') {
      this.whereClause = { ...this.whereClause, ...fieldOrClause };
    } else {
      const field = fieldOrClause;
      if (arguments.length === 2) {
        // where('name', 'John') -> equality
        this.whereClause[field] = operatorOrValue;
      } else {
        // where('age', 'gt', 18) -> operator
        this.whereClause[field] = { [operatorOrValue as string]: value };
      }
    }
    return this;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderByClause[field] = direction;
    return this;
  }

  limit(n: number): this {
    this.limitValue = n;
    return this;
  }

  offset(n: number): this {
    this.offsetValue = n;
    return this;
  }

  async execute(): Promise<RecordWithMetadata[]> {
    return this.table.findMany({
      where: Object.keys(this.whereClause).length > 0 ? this.whereClause : undefined,
      orderBy: Object.keys(this.orderByClause).length > 0 ? this.orderByClause : undefined,
      limit: this.limitValue,
      offset: this.offsetValue
    });
  }

  async first(): Promise<RecordWithMetadata | null> {
    const results = await this.limit(1).execute();
    return results[0] || null;
  }

  async count(): Promise<number> {
    return this.table.count({
      where: Object.keys(this.whereClause).length > 0 ? this.whereClause : undefined
    });
  }
}

// ============================================================================
// Enhanced Table with Query Builder
// ============================================================================

export interface TableClient {
  query(): QueryBuilder;
  findMany(options?: QueryOptions): Promise<RecordWithMetadata[]>;
  findOne(id: string): Promise<RecordWithMetadata | null>;
  create(id: string, data: ParsedRecord): Promise<RecordWithMetadata>;
  update(id: string, data: Partial<ParsedRecord>): Promise<RecordWithMetadata>;
  delete(id: string): Promise<void>;
  count(options?: Pick<QueryOptions, 'where'>): Promise<number>;
  readonly name: string;
  readonly schema: Schema;
}

export function createTableClient(
  table: Table
): TableClient {
  return {
    query: () => new QueryBuilder(table),
    findMany: (opts) => table.findMany(opts),
    findOne: (id) => table.findOne(id),
    create: (id, data) => table.create(id, data),
    update: (id, data) => table.update(id, data),
    delete: (id) => table.delete(id),
    count: (opts) => table.count(opts),
    get name() { return table.name; },
    get schema() { return table.schema; }
  };
}

// ============================================================================
// MarkdownDatabase Client
// ============================================================================

export interface ClientOptions {
  path: string;
}

export class MarkdownDatabase {
  private db: Database;
  private tableClients: Map<string, TableClient> = new Map();

  private constructor(db: Database) {
    this.db = db;
  }

  static async create(options: ClientOptions): Promise<MarkdownDatabase> {
    const db = await Database.create(options.path);
    return new MarkdownDatabase(db);
  }

  table(name: string): TableClient {
    let client = this.tableClients.get(name);
    if (!client) {
      const table = this.db.table(name);
      client = createTableClient(table);
      this.tableClients.set(name, client);
    }
    return client;
  }

  listTables(): string[] {
    return this.db.listTables();
  }

  async createTable(name: string, schema: Schema): Promise<TableClient> {
    const table = await this.db.createTable(name, schema);
    const client = createTableClient(table);
    this.tableClients.set(name, client);
    return client;
  }

  getGlobalSchema(): Schema | null {
    return this.db.getGlobalSchema();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function defineSchema(schema: Schema): Schema {
  return schema;
}

export function createField(
  type: Schema['fields'][string]['type'],
  options: Omit<Schema['fields'][string], 'type'> = {}
): Schema['fields'][string] {
  return { type, ...options };
}

// ============================================================================
// React/Vue Hooks (Framework Agnostic)
// ============================================================================

export interface UseDatabaseResult {
  db: MarkdownDatabase | null;
  loading: boolean;
  error: Error | null;
}

export interface UseTableResult {
  records: RecordWithMetadata[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// Note: Framework-specific hooks should be implemented in separate packages
// Example for React: @mddb/react
// Example for Vue: @mddb/vue

// ============================================================================
// Migration Utilities
// ============================================================================

export interface Migration {
  name: string;
  up: (db: MarkdownDatabase) => Promise<void>;
  down?: (db: MarkdownDatabase) => Promise<void>;
}

export class MigrationRunner {
  constructor(private db: MarkdownDatabase) {}

  async run(migrations: Migration[]): Promise<void> {
    for (const migration of migrations) {
      console.log(`Running migration: ${migration.name}`);
      await migration.up(this.db);
    }
  }

  async rollback(migrations: Migration[]): Promise<void> {
    for (const migration of [...migrations].reverse()) {
      if (migration.down) {
        console.log(`Rolling back migration: ${migration.name}`);
        await migration.down(this.db);
      }
    }
  }
}
