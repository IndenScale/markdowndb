// ============================================================================
// Test Utilities
// ============================================================================

import { existsSync, cpSync, rmSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Database } from '../packages/core/dist/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type FixtureName = 'minimal' | 'global-schema' | 'edge-cases' | 'relations';

const FIXTURES_DIR = join(__dirname, 'fixtures');
const TEMP_DIR = join(__dirname, '.temp');

/**
 * Get the path to a fixture database
 */
export function getFixturePath(name: FixtureName): string {
  return join(FIXTURES_DIR, name);
}

/**
 * Create a temporary copy of a fixture for isolated testing
 */
export function createTempFixture(name: FixtureName, suffix = ''): string {
  const fixturePath = getFixturePath(name);
  const tempName = `${name}-${suffix || Date.now()}`;
  const tempPath = join(TEMP_DIR, tempName);
  
  // Ensure temp dir exists
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  // Clean up if exists
  if (existsSync(tempPath)) {
    rmSync(tempPath, { recursive: true });
  }
  
  // Copy fixture
  cpSync(fixturePath, tempPath, { recursive: true });
  
  return tempPath;
}

/**
 * Load a fixture database
 */
export async function loadFixture(name: FixtureName): Promise<Database> {
  const path = getFixturePath(name);
  return Database.create(path);
}

/**
 * Load a fixture into a temporary copy (for write operations)
 */
export async function loadTempFixture(name: FixtureName): Promise<{ db: Database; cleanup: () => void }> {
  const tempPath = createTempFixture(name);
  const db = await Database.create(tempPath);
  
  const cleanup = () => {
    if (existsSync(tempPath)) {
      rmSync(tempPath, { recursive: true });
    }
  };
  
  return { db, cleanup };
}

/**
 * Clean up all temporary test databases
 */
export function cleanupTempFixtures(): void {
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true });
  }
}

/**
 * Helper to create a minimal valid record
 */
export function createMinimalRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'test-record',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}
