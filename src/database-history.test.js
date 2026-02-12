import Database from './database.js';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Database history', () => {
  let db;
  const testDbPath = join(__dirname, '..', 'test-database-history.db');

  function cleanup() {
    for (const suffix of ['', '-shm', '-wal']) {
      try {
        unlinkSync(`${testDbPath}${suffix}`);
      } catch {
        // ignore
      }
    }
  }

  beforeEach(async () => {
    cleanup();
    db = new Database(testDbPath);
    await db.ready;
  });

  afterEach(async () => {
    if (db && db.db) {
      await new Promise((resolve) => db.db.close(resolve));
    }
    cleanup();
  });

  test('updateTask should register history changes', async () => {
    const projectId = await db.createProject('History');
    const taskId = await db.addTask(projectId, 'Task one', 'Initial description');

    await db.updateTask(taskId, {
      status: 'in-progress',
      priority: 'high',
      description: 'Updated description'
    });

    const history = await db.getTaskHistory(taskId);
    const fields = history.map((row) => row.field);

    expect(fields).toContain('status');
    expect(fields).toContain('priority');
    expect(fields).toContain('description');
  });

  test('should only register changed fields', async () => {
    const projectId = await db.createProject('History');
    const taskId = await db.addTask(projectId, 'Task one', 'Description', 'medium');

    await db.updateTask(taskId, { priority: 'medium' });

    const history = await db.getTaskHistory(taskId);
    expect(history.length).toBe(0);
  });

  test('getTaskHistory should return desc by changed_at and apply limit', async () => {
    const projectId = await db.createProject('History');
    const taskId = await db.addTask(projectId, 'Task one');

    await db.updateTask(taskId, { status: 'in-progress' });
    await db.updateTask(taskId, { status: 'developed' });
    await db.updateTask(taskId, { status: 'tested' });

    const historyLimited = await db.getTaskHistory(taskId, 2);
    expect(historyLimited.length).toBe(2);

    const allHistory = await db.getTaskHistory(taskId, 20);
    expect(new Date(allHistory[0].changed_at).getTime()).toBeGreaterThanOrEqual(new Date(allHistory[1].changed_at).getTime());
  });
});
