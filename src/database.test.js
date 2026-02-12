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

  function cleanupDbFiles() {
    for (const suffix of ['', '-shm', '-wal']) {
      try {
        unlinkSync(`${testDbPath}${suffix}`);
      } catch {
        // ignore
      }
    }
  }

  beforeEach(async () => {
    cleanupDbFiles();
    db = new Database(testDbPath);
    await db.ready;
  });

  afterEach(async () => {
    if (db && db.db) {
      await new Promise((resolve) => {
        db.db.close(() => {
          cleanupDbFiles();
          resolve();
        });
      });
    }
  });

  describe('Project Operations', () => {
    test('should create a project', async () => {
      const projectId = await db.createProject('Portal Web', 'Acme', 'Proyecto principal');
      expect(projectId).toBeGreaterThan(0);
    });

    test('should get all projects', async () => {
      await db.createProject('Portal Web', 'Acme');
      await db.createProject('API Interna', 'Acme');

      const projects = await db.getProjects();
      expect(projects.length).toBe(2);
      expect(projects[0].name).toBe('Portal Web');
      expect(projects[1].name).toBe('API Interna');
    });

    test('should filter projects by client', async () => {
      await db.createProject('Portal Web', 'Client A');
      await db.createProject('API Interna', 'Client B');

      const projects = await db.getProjects('Client A');
      expect(projects.length).toBe(1);
      expect(projects[0].client).toBe('Client A');
    });

    test('should update a project', async () => {
      const projectId = await db.createProject('Portal Web', 'Acme');
      await db.updateProject(projectId, { name: 'Portal Web v2', client: 'Globex' });

      const project = await db.getProject(projectId);
      expect(project.name).toBe('Portal Web v2');
      expect(project.client).toBe('Globex');
    });

    test('should delete a project', async () => {
      const projectId = await db.createProject('Portal Web', 'Acme');
      await db.deleteProject(projectId);

      const project = await db.getProject(projectId);
      expect(project).toBeUndefined();
    });
  });

  describe('Task Operations', () => {
    let projectId;

    beforeEach(async () => {
      projectId = await db.createProject('Portal Web', 'Acme');
    });

    test('should add a task', async () => {
      const taskId = await db.addTask(
        projectId,
        'Implementar login',
        'Implementar login con OAuth',
        'high',
        'Backend',
        'Juan',
        '2026-02-28',
        ['auth', 'backend']
      );

      expect(taskId).toBeGreaterThan(0);
      const task = await db.getTaskById(taskId);
      expect(task.title).toBe('Implementar login');
      expect(task.tags).toEqual(['auth', 'backend']);
    });

    test('should get all tasks for a project', async () => {
      await db.addTask(projectId, 'Task 1', null, 'high');
      await db.addTask(projectId, 'Task 2', null, 'medium');

      const tasks = await db.getTasks({ project_id: projectId });
      expect(tasks.length).toBe(2);
    });

    test('should filter tasks by status', async () => {
      const id1 = await db.addTask(projectId, 'Task 1', null, 'high');
      const id2 = await db.addTask(projectId, 'Task 2', null, 'medium');
      const id3 = await db.addTask(projectId, 'Task 3', null, 'high');

      await db.updateTask(id1, { status: 'developed' });
      await db.updateTask(id2, { status: 'blocked' });
      await db.updateTask(id3, { status: 'developed' });

      const developedTasks = await db.getTasks({ project_id: projectId, status: 'developed' });
      expect(developedTasks.length).toBe(2);
      expect(developedTasks.every((task) => task.status === 'developed')).toBe(true);
    });

    test('should update a task', async () => {
      const taskId = await db.addTask(projectId, 'Task 1', null, 'high');
      await db.updateTask(taskId, {
        status: 'tested',
        notes: 'Validado por QA',
        assignee: 'Maria',
        due_date: '2026-03-10',
        tags: ['qa', 'verified']
      });

      const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
      expect(task.status).toBe('tested');
      expect(task.notes).toBe('Validado por QA');
      expect(task.assignee).toBe('Maria');
      expect(task.due_date).toBe('2026-03-10');
      expect(JSON.parse(task.tags)).toEqual(['qa', 'verified']);
    });

    test('should set completed_at when task is deployed', async () => {
      const taskId = await db.addTask(projectId, 'Release', null, 'critical');
      await db.updateTask(taskId, { status: 'deployed' });

      const task = await db.get('SELECT completed_at FROM tasks WHERE id = ?', [taskId]);
      expect(task.completed_at).toBeTruthy();
    });

    test('should delete a task', async () => {
      const taskId = await db.addTask(projectId, 'Task 1', null, 'high');
      await db.deleteTask(taskId);

      const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
      expect(task).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    test('should calculate project statistics correctly', async () => {
      const projectId = await db.createProject('Portal Web', 'Acme');

      const id1 = await db.addTask(projectId, 'Task 1', null, 'high');
      const id2 = await db.addTask(projectId, 'Task 2', null, 'medium');
      const id3 = await db.addTask(projectId, 'Task 3', null, 'low');
      const id4 = await db.addTask(projectId, 'Task 4', null, 'critical');

      await db.updateTask(id1, { status: 'in-progress' });
      await db.updateTask(id2, { status: 'developed' });
      await db.updateTask(id3, { status: 'deployed' });
      await db.updateTask(id4, { status: 'blocked' });

      const projects = await db.getProjects();
      const project = projects.find((item) => item.id === projectId);

      expect(project.total_tasks).toBe(4);
      expect(project.in_progress_tasks).toBe(1);
      expect(project.developed_tasks).toBe(1);
      expect(project.deployed_tasks).toBe(1);
      expect(project.blocked_tasks).toBe(1);
    });

    test('should get project summary', async () => {
      const projectId = await db.createProject('Portal Web', 'Acme');

      const id1 = await db.addTask(projectId, 'Task 1', null, 'high');
      const id2 = await db.addTask(projectId, 'Task 2', null, 'critical');

      await db.updateTask(id1, { status: 'deployed' });
      await db.updateTask(id2, { status: 'tested' });

      const summary = await db.getProjectSummary(projectId);

      expect(summary.total).toBe(2);
      expect(summary.deployed).toBe(1);
      expect(summary.tested).toBe(1);
      expect(summary.critical).toBe(1);
      expect(summary.high).toBe(1);
      expect(summary.completion_percentage).toBe(50);
      expect(summary.progress_percentage).toBe(100);
      expect(summary.dependency_stats).toBeDefined();
    });
  });
});
