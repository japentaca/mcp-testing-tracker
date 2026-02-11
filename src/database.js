import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isTestMode = process.env.NODE_ENV === 'test';

class Database {
  constructor(dbPath = config.database.path) {
    this.dbPath = dbPath;
    this.db = null;
    this.ready = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) {
          console.error('Error opening database:', err.message);
          reject(err);
          return;
        }
        if (!isTestMode) console.log('Connected to SQLite database');

        try {
          // Enable foreign keys
          await this.run('PRAGMA foreign_keys = ON');
          if (!isTestMode) console.log('Foreign keys enabled');

          // Enable WAL mode for better concurrency
          await this.run('PRAGMA journal_mode = WAL');
          if (!isTestMode) console.log('WAL mode enabled');

          // Load and execute schema
          const schemaPath = join(__dirname, 'schema.sql');
          const schema = readFileSync(schemaPath, 'utf8');

          this.db.exec(schema, (err) => {
            if (err) {
              console.error('Error creating schema:', err.message);
              reject(err);
              return;
            }
            if (!isTestMode) console.log('Database schema initialized');
            resolve();
          });
        } catch (error) {
          console.error('Error during database initialization:', error.message);
          reject(error);
        }
      });
    });
  }

  // Promisify database operations
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Test Suite operations
  async createTestSuite(name, project = null, description = null) {
    const sql = `
      INSERT INTO test_suites (name, project, description, updated_at) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `;
    const result = await this.run(sql, [name, project, description]);
    return result.id;
  }

  async getTestSuites(project = null) {
    let sql = `
      SELECT ts.*, 
             COUNT(tc.id) as total_cases,
             COUNT(CASE WHEN tc.status = 'passed' THEN 1 END) as passed_cases,
             COUNT(CASE WHEN tc.status = 'failed' THEN 1 END) as failed_cases,
             COUNT(CASE WHEN tc.status = 'pending' THEN 1 END) as pending_cases,
             COUNT(CASE WHEN tc.status = 'blocked' THEN 1 END) as blocked_cases,
             COUNT(CASE WHEN tc.status = 'skipped' THEN 1 END) as skipped_cases
      FROM test_suites ts 
      LEFT JOIN test_cases tc ON ts.id = tc.suite_id
    `;

    const params = [];
    if (project) {
      sql += ' WHERE ts.project = ?';
      params.push(project);
    }

    sql += ' GROUP BY ts.id ORDER BY ts.updated_at DESC';

    return await this.all(sql, params);
  }

  async getTestSuite(id) {
    const sql = 'SELECT * FROM test_suites WHERE id = ?';
    return await this.get(sql, [id]);
  }

  async updateTestSuite(id, updates = {}) {
    const allowedFields = ['name', 'project', 'description'];
    const setClause = [];
    const params = [];

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        setClause.push(`${field} = ?`);
        params.push(value);
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `UPDATE test_suites SET ${setClause.join(', ')} WHERE id = ?`;
    const result = await this.run(sql, params);
    return result.changes > 0;
  }

  async deleteTestSuite(id) {
    const sql = 'DELETE FROM test_suites WHERE id = ?';
    const result = await this.run(sql, [id]);
    return result.changes > 0;
  }

  // Test Case operations
  async addTestCase(suiteId, description, priority = 'medium', category = null) {
    const sql = `
      INSERT INTO test_cases (suite_id, description, priority, category, updated_at) 
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    const result = await this.run(sql, [suiteId, description, priority, category]);

    // Update suite timestamp
    await this.run('UPDATE test_suites SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [suiteId]);

    return result.id;
  }

  async updateTestCase(id, updates = {}) {
    const allowedFields = ['status', 'notes', 'priority', 'category', 'description'];
    const setClause = [];
    const params = [];

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        setClause.push(`${field} = ?`);
        params.push(value);
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `UPDATE test_cases SET ${setClause.join(', ')} WHERE id = ?`;
    const result = await this.run(sql, params);

    // Update suite timestamp
    const testCase = await this.get('SELECT suite_id FROM test_cases WHERE id = ?', [id]);
    if (testCase) {
      await this.run('UPDATE test_suites SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [testCase.suite_id]);
    }

    return result.changes > 0;
  }

  async getTestCases(filters = {}) {
    let sql = 'SELECT * FROM test_cases WHERE 1=1';
    const params = [];

    if (filters.suite_id) {
      sql += ' AND suite_id = ?';
      params.push(filters.suite_id);
    }

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.priority) {
      sql += ' AND priority = ?';
      params.push(filters.priority);
    }

    if (filters.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.search) {
      sql += ' AND (description LIKE ? OR notes LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }

    sql += ' ORDER BY created_at DESC';

    return await this.all(sql, params);
  }

  async deleteTestCase(id) {
    // Get suite_id before deletion
    const testCase = await this.get('SELECT suite_id FROM test_cases WHERE id = ?', [id]);

    const sql = 'DELETE FROM test_cases WHERE id = ?';
    const result = await this.run(sql, [id]);

    // Update suite timestamp if case was deleted
    if (result.changes > 0 && testCase) {
      await this.run('UPDATE test_suites SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [testCase.suite_id]);
    }

    return result.changes > 0;
  }

  async getTestSummary(suiteId) {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'passed' THEN 1 END) as passed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped,
        COUNT(CASE WHEN priority = 'critical' THEN 1 END) as critical,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high,
        COUNT(CASE WHEN priority = 'medium' THEN 1 END) as medium,
        COUNT(CASE WHEN priority = 'low' THEN 1 END) as low
      FROM test_cases 
      WHERE suite_id = ?
    `;

    const summary = await this.get(sql, [suiteId]);

    // Calculate completion percentage
    const completed = summary.passed + summary.failed + summary.skipped;
    summary.completion_percentage = summary.total > 0 ? Math.round((completed / summary.total) * 100) : 0;
    summary.pass_percentage = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;

    return summary;
  }

  close() {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        }
        console.log('Database connection closed');
        resolve();
      });
    });
  }
}

export default Database;