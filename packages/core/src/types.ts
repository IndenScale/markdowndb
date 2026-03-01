// ============================================================================
// MarkdownDB Core Types
// ============================================================================

export type FieldType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'datetime' 
  | 'array' 
  | 'object' 
  | 'reference' 
  | 'markdown' 
  | 'code' 
  | 'wiki_link';

export interface FieldDefinition {
  type: FieldType;
  required?: boolean;
  items?: FieldDefinition; // For array type
  table?: string;          // For reference type
}

export interface Schema {
  name?: string;
  fields: Record<string, FieldDefinition>;
}

export interface DatabaseConfig {
  version: string;
  id: string;
  createdAt: string;
}

export interface CodeBlock {
  language: string;
  code: string;
}

export interface WikiLink {
  target: string;
  table: string;
  id: string;
  label: string;
}

export interface ParsedRecord {
  // Frontmatter fields
  [key: string]: unknown;
  // Content fields (content-## heading)
  [contentKey: `content-##${string}`]: string | CodeBlock;
  // Wiki links
  wiki_links?: WikiLink[];
}

export interface RecordWithMetadata extends ParsedRecord {
  _table: string;
  _id: string;
  _path: string;
}

// Query types
export interface FilterOperator<T = unknown> {
  eq?: T;
  ne?: T;
  gt?: T;
  gte?: T;
  lt?: T;
  lte?: T;
  contains?: T;
  startsWith?: string;
  endsWith?: string;
  in?: T[];
}

export type FilterValue<T = unknown> = T | FilterOperator<T> | null;

export interface WhereClause {
  [field: string]: FilterValue;
}

export type OrderDirection = 'asc' | 'desc';

export interface OrderByClause {
  [field: string]: OrderDirection;
}

export interface QueryOptions {
  where?: WhereClause;
  orderBy?: OrderByClause;
  limit?: number;
  offset?: number;
}

// Error types
export class MarkdownDBError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'MarkdownDBError';
  }
}

export class ValidationError extends MarkdownDBError {
  constructor(message: string, public details: string[]) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class SchemaError extends MarkdownDBError {
  constructor(message: string, public table?: string) {
    super(message, 'SCHEMA_ERROR');
    this.name = 'SchemaError';
  }
}

export class RecordNotFoundError extends MarkdownDBError {
  constructor(table: string, id: string) {
    super(`Record '${id}' not found in table '${table}'`, 'RECORD_NOT_FOUND');
    this.name = 'RecordNotFoundError';
  }
}
