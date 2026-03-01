// ============================================================================
// MarkdownDB Core - Export public API
// ============================================================================

export { Database, Table } from './database.js';
export { 
  loadSchema, 
  loadDatabaseSchema, 
  loadTableSchema,
  validateGlobalSchemaCompliance,
  validateRecord,
  coerceValue
} from './schema.js';
export { 
  parseMarkdown, 
  serializeRecord,
  validateTitleConsistency
} from './parser.js';

// Types
export type {
  FieldType,
  FieldDefinition,
  Schema,
  DatabaseConfig,
  CodeBlock,
  WikiLink,
  ParsedRecord,
  RecordWithMetadata,
  FilterOperator,
  FilterValue,
  WhereClause,
  OrderDirection,
  OrderByClause,
  QueryOptions
} from './types.js';

// Errors
export {
  MarkdownDBError,
  ValidationError,
  SchemaError,
  RecordNotFoundError
} from './types.js';
