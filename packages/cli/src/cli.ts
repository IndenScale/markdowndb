#!/usr/bin/env node
// ============================================================================
// MarkdownDB CLI
// ============================================================================

import { Command } from 'commander';
import chalk from 'chalk';
import { MarkdownDatabase } from '@mddb/sdk';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import YAML from 'yaml';

const program = new Command();

program
  .name('mddb')
  .description('MarkdownDB CLI - Manage your Markdown files as a database')
  .version('0.1.0');

// Helper to find database root
async function findDatabaseRoot(startPath: string): Promise<string | null> {
  let current = resolve(startPath);
  
  while (current !== '/') {
    const mddbDir = join(current, '.mddb');
    if (existsSync(mddbDir)) {
      return current;
    }
    const parent = join(current, '..');
    if (parent === current) break;
    current = parent;
  }
  
  return null;
}

async function getDatabase(rootPath?: string): Promise<MarkdownDatabase> {
  const dbRoot = rootPath 
    ? resolve(rootPath)
    : await findDatabaseRoot(process.cwd());
  
  if (!dbRoot) {
    console.error(chalk.red('Error: Not a MarkdownDB database. Run "mddb init" first.'));
    process.exit(1);
  }
  
  return MarkdownDatabase.create({ path: dbRoot });
}

// ============================================================================
// Database Commands
// ============================================================================

program
  .command('init')
  .description('Initialize a new MarkdownDB database')
  .argument('[path]', 'Database directory path', '.')
  .option('-g, --global-schema <file>', 'Path to global schema JSON file')
  .action(async (path, options) => {
    const dbPath = resolve(path);
    
    try {
      // Copy global schema if provided before creating database
      if (options.globalSchema && existsSync(options.globalSchema)) {
        const schemaPath = join(dbPath, 'schema.json');
        const { copyFileSync, mkdirSync } = await import('fs');
        mkdirSync(dbPath, { recursive: true });
        copyFileSync(options.globalSchema, schemaPath);
        console.log(chalk.green(`✓ Global schema copied from ${options.globalSchema}`));
      }
      
      const db = await MarkdownDatabase.create({ path: dbPath });
      
      console.log(chalk.green(`✓ MarkdownDB initialized at ${dbPath}`));
      console.log(chalk.gray(`  Database ID: ${db.getGlobalSchema() ? 'with global schema' : 'no global schema'}`));
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show database status')
  .option('-p, --path <path>', 'Database path')
  .action(async (options) => {
    try {
      const db = await getDatabase(options.path);
      const tables = db.listTables();
      const globalSchema = db.getGlobalSchema();
      
      console.log(chalk.bold('Database Status'));
      console.log(chalk.gray('─'.repeat(40)));
      
      if (globalSchema) {
        console.log(chalk.cyan('Global Schema:'));
        const fields = Object.keys(globalSchema.fields);
        console.log(`  Required fields: ${fields.join(', ')}`);
      } else {
        console.log(chalk.gray('No global schema defined'));
      }
      
      console.log(chalk.cyan(`\nTables (${tables.length}):`));
      for (const tableName of tables) {
        const table = db.table(tableName);
        const count = await table.count();
        console.log(`  • ${chalk.bold(tableName)}: ${count} records`);
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

// ============================================================================
// Table Commands
// ============================================================================

const tableCmd = program
  .command('table')
  .description('Manage tables');

tableCmd
  .command('list')
  .description('List all tables')
  .option('-p, --path <path>', 'Database path')
  .action(async (options) => {
    try {
      const db = await getDatabase(options.path);
      const tables = db.listTables();
      
      console.log(chalk.bold('Tables:'));
      for (const name of tables) {
        const table = db.table(name);
        const count = await table.count();
        console.log(`  ${chalk.cyan(name)} (${count} records)`);
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

tableCmd
  .command('create')
  .description('Create a new table')
  .argument('<name>', 'Table name')
  .requiredOption('-s, --schema <file>', 'Path to schema JSON file')
  .option('-p, --path <path>', 'Database path')
  .action(async (name, options) => {
    try {
      if (!existsSync(options.schema)) {
        console.error(chalk.red(`Error: Schema file not found: ${options.schema}`));
        process.exit(1);
      }
      
      const schemaContent = readFileSync(options.schema, 'utf-8');
      const schema = JSON.parse(schemaContent);
      
      const db = await getDatabase(options.path);
      await db.createTable(name, schema);
      
      console.log(chalk.green(`✓ Table '${name}' created`));
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

tableCmd
  .command('schema')
  .description('Show table schema')
  .argument('<name>', 'Table name')
  .option('-p, --path <path>', 'Database path')
  .action(async (name, options) => {
    try {
      const db = await getDatabase(options.path);
      const table = db.table(name);
      
      console.log(chalk.bold(`Schema for table '${name}':`));
      console.log(JSON.stringify(table.schema, null, 2));
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

// ============================================================================
// Record Commands
// ============================================================================

const recordCmd = program
  .command('record')
  .description('Manage records');

recordCmd
  .command('list')
  .description('List records in a table')
  .argument('<table>', 'Table name')
  .option('-p, --path <path>', 'Database path')
  .option('-l, --limit <n>', 'Limit results', '10')
  .option('-o, --offset <n>', 'Offset results', '0')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .action(async (tableName, options) => {
    try {
      const db = await getDatabase(options.path);
      const table = db.table(tableName);
      
      const records = await table.findMany({
        limit: parseInt(options.limit),
        offset: parseInt(options.offset)
      });
      
      if (records.length === 0) {
        console.log(chalk.gray('No records found'));
        return;
      }
      
      if (options.format === 'json') {
        console.log(JSON.stringify(records, null, 2));
      } else {
        console.log(chalk.bold(`Records in '${tableName}' (${records.length}):`));
        console.log(chalk.gray('─'.repeat(60)));
        
        for (const record of records) {
          const title = String(record.title || record._id);
          console.log(`  ${chalk.cyan(record._id)}: ${title}`);
        }
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

recordCmd
  .command('get')
  .description('Get a single record')
  .argument('<table>', 'Table name')
  .argument('<id>', 'Record ID')
  .option('-p, --path <path>', 'Database path')
  .option('-f, --format <format>', 'Output format (yaml|json)', 'yaml')
  .action(async (tableName, id, options) => {
    try {
      const db = await getDatabase(options.path);
      const table = db.table(tableName);
      const record = await table.findOne(id);
      
      if (!record) {
        console.error(chalk.red(`Error: Record '${id}' not found in table '${tableName}'`));
        process.exit(1);
      }
      
      if (options.format === 'json') {
        console.log(JSON.stringify(record, null, 2));
      } else {
        console.log(YAML.stringify(record));
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

recordCmd
  .command('create')
  .description('Create a new record')
  .argument('<table>', 'Table name')
  .argument('<id>', 'Record ID')
  .requiredOption('-d, --data <json>', 'Record data as JSON string')
  .option('-p, --path <path>', 'Database path')
  .action(async (tableName, id, options) => {
    try {
      const data = JSON.parse(options.data);
      
      const db = await getDatabase(options.path);
      const table = db.table(tableName);
      const record = await table.create(id, data);
      
      console.log(chalk.green(`✓ Record '${id}' created in table '${tableName}'`));
      console.log(chalk.gray(`  Path: ${record._path}`));
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

recordCmd
  .command('update')
  .description('Update a record')
  .argument('<table>', 'Table name')
  .argument('<id>', 'Record ID')
  .requiredOption('-d, --data <json>', 'Record data as JSON string')
  .option('-p, --path <path>', 'Database path')
  .action(async (tableName, id, options) => {
    try {
      const data = JSON.parse(options.data);
      
      const db = await getDatabase(options.path);
      const table = db.table(tableName);
      await table.update(id, data);
      
      console.log(chalk.green(`✓ Record '${id}' updated in table '${tableName}'`));
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

recordCmd
  .command('delete')
  .description('Delete a record')
  .argument('<table>', 'Table name')
  .argument('<id>', 'Record ID')
  .option('-p, --path <path>', 'Database path')
  .action(async (tableName, id, options) => {
    try {
      const db = await getDatabase(options.path);
      const table = db.table(tableName);
      await table.delete(id);
      
      console.log(chalk.green(`✓ Record '${id}' deleted from table '${tableName}'`));
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

// ============================================================================
// Query Commands
// ============================================================================

program
  .command('query')
  .description('Query records with filters')
  .argument('<table>', 'Table name')
  .option('-p, --path <path>', 'Database path')
  .option('-w, --where <conditions>', 'Where conditions as JSON')
  .option('-o, --order <field>', 'Order by field')
  .option('-d, --direction <dir>', 'Sort direction (asc|desc)', 'asc')
  .option('-l, --limit <n>', 'Limit results', '10')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .action(async (tableName, options) => {
    try {
      const db = await getDatabase(options.path);
      const table = db.table(tableName);
      
      const queryOptions: { where?: Record<string, unknown>; orderBy?: Record<string, 'asc' | 'desc'>; limit: number } = {
        limit: parseInt(options.limit)
      };
      
      if (options.where) {
        queryOptions.where = JSON.parse(options.where);
      }
      
      if (options.order) {
        queryOptions.orderBy = { [options.order]: options.direction };
      }
      
      const records = await table.findMany(queryOptions);
      
      if (records.length === 0) {
        console.log(chalk.gray('No records found'));
        return;
      }
      
      if (options.format === 'json') {
        console.log(JSON.stringify(records, null, 2));
      } else {
        console.log(chalk.bold(`Query Results (${records.length}):`));
        console.log(chalk.gray('─'.repeat(60)));
        
        for (const record of records) {
          const title = String(record.title || record._id);
          console.log(`  ${chalk.cyan(record._id)}: ${title}`);
        }
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

// ============================================================================
// Validate Command
// ============================================================================

program
  .command('validate')
  .description('Validate database and all records')
  .option('-p, --path <path>', 'Database path')
  .action(async (options) => {
    try {
      const db = await getDatabase(options.path);
      const tables = db.listTables();
      
      let totalErrors = 0;
      
      console.log(chalk.bold('Validating database...'));
      console.log(chalk.gray('─'.repeat(60)));
      
      for (const tableName of tables) {
        const table = db.table(tableName);
        const records = await table.findMany();
        
        console.log(chalk.cyan(`Table '${tableName}': ${records.length} records`));
        
        for (const record of records) {
          try {
            // Re-validate the record
            await table.findOne(record._id);
          } catch (err) {
            totalErrors++;
            console.log(chalk.red(`  ✗ ${record._id}: ${err instanceof Error ? err.message : String(err)}`));
          }
        }
      }
      
      console.log(chalk.gray('─'.repeat(60)));
      if (totalErrors === 0) {
        console.log(chalk.green('✓ All records are valid'));
      } else {
        console.log(chalk.red(`✗ ${totalErrors} validation error(s) found`));
        process.exit(1);
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

// Run the CLI
program.parse();
