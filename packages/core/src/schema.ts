// ============================================================================
// Schema Validation
// ============================================================================

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Schema, FieldDefinition, FieldType } from './types.js';
import { SchemaError, ValidationError } from './types.js';

const VALID_TYPES: FieldType[] = [
  'string', 'number', 'boolean', 'datetime', 'array', 
  'object', 'reference', 'markdown', 'code', 'wiki_link'
];

export function loadSchema(schemaPath: string): Schema {
  if (!existsSync(schemaPath)) {
    throw new SchemaError(`Schema file not found: ${schemaPath}`);
  }
  
  try {
    const content = readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(content) as Schema;
    validateSchemaStructure(schema, schemaPath);
    return schema;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new SchemaError(`Invalid JSON in schema file: ${schemaPath}`);
    }
    throw err;
  }
}

export function loadDatabaseSchema(dbPath: string): Schema | null {
  const schemaPath = join(dbPath, 'schema.json');
  if (!existsSync(schemaPath)) {
    return null;
  }
  return loadSchema(schemaPath);
}

export function loadTableSchema(tablePath: string): Schema {
  const schemaPath = join(tablePath, 'schema.json');
  return loadSchema(schemaPath);
}

function validateSchemaStructure(schema: Schema, path: string): void {
  if (!schema.fields || typeof schema.fields !== 'object') {
    throw new SchemaError(`Schema must have a 'fields' object: ${path}`);
  }
  
  for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
    if (fieldName === 'id') {
      throw new SchemaError(`Field name 'id' is reserved (use 'title' as primary key): ${path}`);
    }
    validateFieldDefinition(fieldName, fieldDef, path);
  }
}

function validateFieldDefinition(
  name: string, 
  def: FieldDefinition, 
  path: string
): void {
  if (!def.type || !VALID_TYPES.includes(def.type)) {
    throw new SchemaError(
      `Invalid type '${def.type}' for field '${name}' in ${path}`
    );
  }
  
  // Validate array items
  if (def.type === 'array' && def.items) {
    validateFieldDefinition(`${name}[items]`, def.items, path);
  }
  
  // Validate reference has table
  if (def.type === 'reference' && !def.table) {
    throw new SchemaError(
      `Field '${name}' of type 'reference' must specify 'table': ${path}`
    );
  }
}

export function validateGlobalSchemaCompliance(
  tableSchema: Schema,
  globalSchema: Schema | null,
  tableName: string,
  tablePath: string
): void {
  if (!globalSchema) return;
  
  const errors: string[] = [];
  
  for (const [fieldName, globalFieldDef] of Object.entries(globalSchema.fields)) {
    const tableFieldDef = tableSchema.fields[fieldName];
    
    if (!tableFieldDef) {
      errors.push(`Missing required global field: '${fieldName}'`);
      continue;
    }
    
    if (tableFieldDef.type !== globalFieldDef.type) {
      errors.push(
        `Field '${fieldName}' type mismatch: expected '${globalFieldDef.type}', got '${tableFieldDef.type}'`
      );
    }
    
    if (globalFieldDef.required && !tableFieldDef.required) {
      errors.push(`Field '${fieldName}' must be required (global schema constraint)`);
    }
  }
  
  if (errors.length > 0) {
    throw new SchemaError(
      `Table '${tableName}' validation failed:\n  ${errors.join('\n  ')}\n  Location: ${tablePath}/schema.json`
    );
  }
}

export function validateRecord(
  record: Record<string, unknown>,
  schema: Schema,
  tableName: string
): void {
  const errors: string[] = [];
  
  for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
    const value = record[fieldName];
    
    // Check required fields
    if (fieldDef.required && (value === undefined || value === null || value === '')) {
      errors.push(`Required field '${fieldName}' is missing or empty`);
      continue;
    }
    
    if (value === undefined || value === null) continue;
    
    // Type validation
    const typeError = validateFieldType(fieldName, value, fieldDef);
    if (typeError) {
      errors.push(typeError);
    }
  }
  
  if (errors.length > 0) {
    throw new ValidationError(
      `Record validation failed in table '${tableName}':`,
      errors
    );
  }
}

function validateFieldType(
  name: string,
  value: unknown,
  def: FieldDefinition
): string | null {
  switch (def.type) {
    case 'string':
    case 'markdown':
    case 'wiki_link':
      if (typeof value !== 'string') {
        return `Field '${name}' must be a string, got ${typeof value}`;
      }
      break;
      
    case 'number':
      if (typeof value !== 'number') {
        return `Field '${name}' must be a number, got ${typeof value}`;
      }
      break;
      
    case 'boolean':
      if (typeof value !== 'boolean') {
        return `Field '${name}' must be a boolean, got ${typeof value}`;
      }
      break;
      
    case 'datetime':
      if (typeof value !== 'string') {
        return `Field '${name}' must be a datetime string, got ${typeof value}`;
      }
      if (isNaN(Date.parse(value as string))) {
        return `Field '${name}' must be a valid ISO 8601 datetime`;
      }
      break;
      
    case 'array':
      if (!Array.isArray(value)) {
        return `Field '${name}' must be an array, got ${typeof value}`;
      }
      if (def.items) {
        for (let i = 0; i < value.length; i++) {
          const itemError = validateFieldType(`${name}[${i}]`, value[i], def.items);
          if (itemError) return itemError;
        }
      }
      break;
      
    case 'object':
    case 'code':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return `Field '${name}' must be an object, got ${typeof value}`;
      }
      break;
      
    case 'reference':
      if (typeof value !== 'string') {
        return `Field '${name}' must be a string reference, got ${typeof value}`;
      }
      break;
  }
  
  return null;
}

export function coerceValue(value: unknown, type: FieldType): unknown {
  if (value === null || value === undefined) return value;
  
  switch (type) {
    case 'string':
    case 'markdown':
    case 'wiki_link':
      return String(value);
      
    case 'number':
      if (typeof value === 'number') return value;
      const num = Number(value);
      return isNaN(num) ? value : num;
      
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return value === 'true' || value === true || value === 1;
      
    case 'datetime':
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'string') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : date.toISOString();
      }
      return value;
      
    default:
      return value;
  }
}
