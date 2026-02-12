import Database from './database.js';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Database dependencies', () => {
  let db;
  const testDbPath = join(__dirname, '..', 'test-database-deps.db');

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

  test('should add and remove dependency', async () => {
    const projectId = await db.createProject('Deps Project');
    const a = await db.addTask(projectId, 'Task A');
    const b = await db.addTask(projectId, 'Task B');

    await db.addDependency(a, b);
    expect(await db.dependencyExists(a, b)).toBe(true);

    const removed = await db.removeDependency(a, b);
    expect(removed).toBe(true);
    expect(await db.dependencyExists(a, b)).toBe(false);
  });

  test('should detect simple cycle A -> B -> A', async () => {
    const projectId = await db.createProject('Cycle Project');
    const a = await db.addTask(projectId, 'Task A');
    const b = await db.addTask(projectId, 'Task B');

    await db.addDependency(a, b);
    const createsCycle = await db.checkForCycle(b, a);
    expect(createsCycle).toBe(true);
  });

  test('should detect complex cycle A -> B -> C -> A', async () => {
    const projectId = await db.createProject('Cycle Project');
    const a = await db.addTask(projectId, 'Task A');
    const b = await db.addTask(projectId, 'Task B');
    const c = await db.addTask(projectId, 'Task C');

    await db.addDependency(a, b);
    await db.addDependency(b, c);

    const createsCycle = await db.checkForCycle(c, a);
    expect(createsCycle).toBe(true);
  });

  test('should return blocked and actionable tasks correctly', async () => {
    const projectId = await db.createProject('Block/Action');
    const foundation = await db.addTask(projectId, 'Foundation');
    const integration = await db.addTask(projectId, 'Integration');
    const docs = await db.addTask(projectId, 'Docs');

    await db.addDependency(integration, foundation);

    let blocked = await db.getBlockedTasks(projectId);
    let actionable = await db.getNextActionable(projectId);

    expect(blocked.some((task) => task.id === integration)).toBe(true);
    expect(actionable.some((task) => task.id === foundation)).toBe(true);
    expect(actionable.some((task) => task.id === docs)).toBe(true);

    await db.updateTask(foundation, { status: 'tested' });

    blocked = await db.getBlockedTasks(projectId);
    actionable = await db.getNextActionable(projectId);

    expect(blocked.some((task) => task.id === integration)).toBe(false);
    expect(actionable.some((task) => task.id === integration)).toBe(true);
  });

  test('cascade delete should remove dependencies', async () => {
    const projectId = await db.createProject('Cascade');
    const a = await db.addTask(projectId, 'Task A');
    const b = await db.addTask(projectId, 'Task B');

    await db.addDependency(a, b);
    await db.deleteTask(b);

    const deps = await db.getDependencyIds(a);
    expect(deps).toEqual([]);
  });
});
