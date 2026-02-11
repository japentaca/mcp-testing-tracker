import Database from './database.js';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Database', () => {
  let db;
  const testDbPath = join(__dirname, '..', 'test-database.db');

  beforeEach(async () => {
    // Create a fresh database for each test
    db = new Database(testDbPath);
    await db.ready;
  });

  afterEach(async () => {
    // Close database connection and clean up
    if (db && db.db) {
      await new Promise((resolve) => {
        db.db.close(() => {
          try {
            unlinkSync(testDbPath);
          } catch (e) {
            // Ignore if file doesn't exist
          }
          resolve();
        });
      });
    }
  });

  describe('Test Suite Operations', () => {
    test('should create a test suite', async () => {
      const suiteId = await db.createTestSuite('Login Tests', 'MyApp', 'Tests for login functionality');
      expect(suiteId).toBeGreaterThan(0);
    });

    test('should get all test suites', async () => {
      await db.createTestSuite('Login Tests', 'MyApp');
      await db.createTestSuite('Signup Tests', 'MyApp');
      
      const suites = await db.getTestSuites();
      expect(suites.length).toBe(2);
      expect(suites[0].name).toBe('Login Tests');
      expect(suites[1].name).toBe('Signup Tests');
    });

    test('should filter test suites by project', async () => {
      await db.createTestSuite('Login Tests', 'Project A');
      await db.createTestSuite('Signup Tests', 'Project B');
      
      const suites = await db.getTestSuites('Project A');
      expect(suites.length).toBe(1);
      expect(suites[0].project).toBe('Project A');
    });

    test('should get a specific test suite by id', async () => {
      const suiteId = await db.createTestSuite('Login Tests', 'MyApp');
      
      const suite = await db.getTestSuite(suiteId);
      expect(suite).toBeDefined();
      expect(suite.id).toBe(suiteId);
      expect(suite.name).toBe('Login Tests');
    });

    test('should update a test suite', async () => {
      const suiteId = await db.createTestSuite('Login Tests', 'MyApp');
      
      await db.updateTestSuite(suiteId, { name: 'Updated Login Tests', project: 'NewApp' });
      
      const suite = await db.getTestSuite(suiteId);
      expect(suite.name).toBe('Updated Login Tests');
      expect(suite.project).toBe('NewApp');
    });

    test('should delete a test suite', async () => {
      const suiteId = await db.createTestSuite('Login Tests', 'MyApp');
      
      await db.deleteTestSuite(suiteId);
      
      const suite = await db.getTestSuite(suiteId);
      expect(suite).toBeUndefined();
    });
  });

  describe('Test Case Operations', () => {
    let suiteId;

    beforeEach(async () => {
      suiteId = await db.createTestSuite('Login Tests', 'MyApp');
    });

    test('should add a test case', async () => {
      const caseId = await db.addTestCase(
        suiteId,
        'Verify login with valid credentials',
        'high',
        'Authentication'
      );
      expect(caseId).toBeGreaterThan(0);
    });

    test('should get all test cases for a suite', async () => {
      await db.addTestCase(suiteId, 'Test 1', 'high');
      await db.addTestCase(suiteId, 'Test 2', 'medium');
      
      const cases = await db.getTestCases({ suite_id: suiteId });
      expect(cases.length).toBe(2);
      // Cases are returned in DESC order by created_at
      expect(cases[0].description).toBe('Test 1');
      expect(cases[1].description).toBe('Test 2');
    });

    test('should filter test cases by status', async () => {
      const id1 = await db.addTestCase(suiteId, 'Test 1', 'high');
      const id2 = await db.addTestCase(suiteId, 'Test 2', 'medium');
      const id3 = await db.addTestCase(suiteId, 'Test 3', 'high');
      
      await db.updateTestCase(id1, { status: 'passed' });
      await db.updateTestCase(id2, { status: 'failed' });
      await db.updateTestCase(id3, { status: 'passed' });
      
      const passedCases = await db.getTestCases({ suite_id: suiteId, status: 'passed' });
      expect(passedCases.length).toBe(2);
      expect(passedCases.every(c => c.status === 'passed')).toBe(true);
    });

    test('should update a test case', async () => {
      const caseId = await db.addTestCase(suiteId, 'Test 1', 'high');
      
      await db.updateTestCase(caseId, { status: 'passed', notes: 'All good!' });
      
      const testCase = await db.get('SELECT * FROM test_cases WHERE id = ?', [caseId]);
      expect(testCase.status).toBe('passed');
      expect(testCase.notes).toBe('All good!');
    });

    test('should delete a test case', async () => {
      const caseId = await db.addTestCase(suiteId, 'Test 1', 'high');
      
      await db.deleteTestCase(caseId);
      
      const testCase = await db.get('SELECT * FROM test_cases WHERE id = ?', [caseId]);
      expect(testCase).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    test('should calculate suite statistics correctly', async () => {
      const suiteId = await db.createTestSuite('Login Tests', 'MyApp');
      
      const id1 = await db.addTestCase(suiteId, 'Test 1', 'high');
      const id2 = await db.addTestCase(suiteId, 'Test 2', 'medium');
      const id3 = await db.addTestCase(suiteId, 'Test 3', 'low');
      const id4 = await db.addTestCase(suiteId, 'Test 4', 'high');
      
      await db.updateTestCase(id1, { status: 'passed' });
      await db.updateTestCase(id2, { status: 'passed' });
      await db.updateTestCase(id3, { status: 'failed' });
      // id4 stays as pending
      
      const suites = await db.getTestSuites();
      const suite = suites.find(s => s.id === suiteId);
      
      expect(suite.total_cases).toBe(4);
      expect(suite.passed_cases).toBe(2);
      expect(suite.failed_cases).toBe(1);
      expect(suite.pending_cases).toBe(1);
    });

    test('should get test summary for a suite', async () => {
      const suiteId = await db.createTestSuite('Login Tests', 'MyApp');
      
      const id1 = await db.addTestCase(suiteId, 'Test 1', 'high');
      const id2 = await db.addTestCase(suiteId, 'Test 2', 'critical');
      
      await db.updateTestCase(id1, { status: 'passed' });
      await db.updateTestCase(id2, { status: 'failed' });
      
      const summary = await db.getTestSummary(suiteId);
      
      expect(summary.total).toBe(2);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.critical).toBe(1);
      expect(summary.high).toBe(1);
      expect(summary.completion_percentage).toBe(100);
      expect(summary.pass_percentage).toBe(50);
    });
  });
});
