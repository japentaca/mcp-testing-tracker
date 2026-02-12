import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import config from './config.js';
import { runMigrations } from './migrations.js';

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

            runMigrations(this)
              .then(() => resolve())
              .catch((migrationError) => {
                console.error('Error running migrations:', migrationError.message);
                reject(migrationError);
              });
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

  // Project operations (formerly test_suites)
  async createProject(name, client = null, description = null) {
    const sql = `
      INSERT INTO projects (name, client, description, updated_at) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `;
    const result = await this.run(sql, [name, client, description]);
    return result.id;
  }

  async getProjects(client = null) {
    let sql = `
      SELECT p.*, 
             COUNT(t.id) as total_tasks,
             COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_tasks,
             COUNT(CASE WHEN t.status = 'in-progress' THEN 1 END) as in_progress_tasks,
             COUNT(CASE WHEN t.status = 'developed' THEN 1 END) as developed_tasks,
             COUNT(CASE WHEN t.status = 'tested' THEN 1 END) as tested_tasks,
             COUNT(CASE WHEN t.status = 'deployed' THEN 1 END) as deployed_tasks,
             COUNT(CASE WHEN t.status = 'blocked' THEN 1 END) as blocked_tasks
      FROM projects p 
      LEFT JOIN tasks t ON p.id = t.project_id
    `;

    const params = [];
    if (client) {
      sql += ' WHERE p.client = ?';
      params.push(client);
    }

    sql += ' GROUP BY p.id ORDER BY p.updated_at DESC';

    return await this.all(sql, params);
  }

  async getProject(id) {
    const sql = 'SELECT * FROM projects WHERE id = ?';
    return await this.get(sql, [id]);
  }

  async updateProject(id, updates = {}) {
    const allowedFields = ['name', 'client', 'description'];
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

    const sql = `UPDATE projects SET ${setClause.join(', ')} WHERE id = ?`;
    const result = await this.run(sql, params);
    return result.changes > 0;
  }

  async deleteProject(id) {
    const sql = 'DELETE FROM projects WHERE id = ?';
    const result = await this.run(sql, [id]);
    return result.changes > 0;
  }

  // Task operations (formerly test_cases)
  async addTask(projectId, title, description = null, priority = 'medium', category = null, assignee = null, dueDate = null, tags = null, dependsOn = []) {
    const normalizedTitle = title || description;
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (typeof tags === 'string' ? tags : null);

    const sql = `
      INSERT INTO tasks (project_id, title, description, priority, category, assignee, due_date, tags, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    const result = await this.run(sql, [projectId, normalizedTitle, description, priority, category, assignee, dueDate, tagsJson]);
    const taskId = result.id;

    for (const depId of dependsOn) {
      await this.addDependency(taskId, depId);
    }

    // Update project timestamp
    await this.run('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [projectId]);

    return taskId;
  }

  async updateTask(id, updates = {}) {
    const current = await this.get('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!current) return false;

    const allowedFields = ['status', 'notes', 'priority', 'category', 'description', 'title', 'assignee', 'due_date', 'tags'];
    const setClause = [];
    const params = [];

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        const finalValue = field === 'tags' && Array.isArray(value) ? JSON.stringify(value) : value;
        setClause.push(`${field} = ?`);
        params.push(finalValue);

        const oldValue = current[field];
        if (String(oldValue) !== String(finalValue)) {
          await this.addHistory(id, field, oldValue, finalValue);
        }
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    if (updates.status === 'deployed' && current.status !== 'deployed') {
      setClause.push('completed_at = CURRENT_TIMESTAMP');
    }

    setClause.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `UPDATE tasks SET ${setClause.join(', ')} WHERE id = ?`;
    const result = await this.run(sql, params);

    // Update project timestamp
    const task = await this.get('SELECT project_id FROM tasks WHERE id = ?', [id]);
    if (task) {
      await this.run('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [task.project_id]);
    }

    return result.changes > 0;
  }

  async getTasks(filters = {}) {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (filters.project_id) {
      sql += ' AND project_id = ?';
      params.push(filters.project_id);
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

    if (filters.assignee) {
      sql += ' AND assignee = ?';
      params.push(filters.assignee);
    }

    if (filters.search) {
      sql += ' AND (title LIKE ? OR description LIKE ? OR notes LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY created_at DESC';

    const tasks = await this.all(sql, params);

    for (const task of tasks) {
      task.tags = task.tags ? JSON.parse(task.tags) : [];
      task.incomplete_dependencies = await this.getIncompleteDependencies(task.id);
      task.blocking_tasks = task.incomplete_dependencies;
      task.is_blocked_by_dependencies = task.incomplete_dependencies.length > 0;
      if (!task.title) {
        task.title = task.description || `Task #${task.id}`;
      }
    }

    return tasks;
  }

  async deleteTask(id) {
    // Get project_id before deletion
    const task = await this.get('SELECT project_id FROM tasks WHERE id = ?', [id]);

    const sql = 'DELETE FROM tasks WHERE id = ?';
    const result = await this.run(sql, [id]);

    // Update project timestamp if task was deleted
    if (result.changes > 0 && task) {
      await this.run('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [task.project_id]);
    }

    return result.changes > 0;
  }

  async getProjectSummary(projectId) {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'developed' THEN 1 END) as developed,
        COUNT(CASE WHEN status = 'tested' THEN 1 END) as tested,
        COUNT(CASE WHEN status = 'deployed' THEN 1 END) as deployed,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked,
        COUNT(CASE WHEN priority = 'critical' THEN 1 END) as critical,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high,
        COUNT(CASE WHEN priority = 'medium' THEN 1 END) as medium,
        COUNT(CASE WHEN priority = 'low' THEN 1 END) as low
      FROM tasks 
      WHERE project_id = ?
    `;

    const summary = await this.get(sql, [projectId]);
    const dependencyStats = await this.getDependencyStats(projectId);

    // Calculate completion percentage (deployed = completed)
    summary.completion_percentage = summary.total > 0 ? Math.round((summary.deployed / summary.total) * 100) : 0;
    summary.progress_percentage = summary.total > 0 ? Math.round(((summary.developed + summary.tested + summary.deployed) / summary.total) * 100) : 0;
    summary.dependency_stats = dependencyStats;

    return summary;
  }

  async addDependency(taskId, dependsOnTaskId) {
    const sql = 'INSERT INTO dependencies (task_id, depends_on_task_id) VALUES (?, ?)';
    return await this.run(sql, [taskId, dependsOnTaskId]);
  }

  async removeDependency(taskId, dependsOnTaskId) {
    const sql = 'DELETE FROM dependencies WHERE task_id = ? AND depends_on_task_id = ?';
    const result = await this.run(sql, [taskId, dependsOnTaskId]);
    return result.changes > 0;
  }

  async getTaskDependencies(taskId) {
    const sql = `
      SELECT t.* FROM tasks t
      JOIN dependencies d ON t.id = d.depends_on_task_id
      WHERE d.task_id = ?
    `;
    return await this.all(sql, [taskId]);
  }

  async getDependencyIds(taskId) {
    const sql = 'SELECT depends_on_task_id FROM dependencies WHERE task_id = ?';
    const rows = await this.all(sql, [taskId]);
    return rows.map((row) => row.depends_on_task_id);
  }

  async getIncompleteDependencies(taskId) {
    const sql = `
      SELECT t.id, t.title, t.status
      FROM dependencies d
      JOIN tasks t ON d.depends_on_task_id = t.id
      WHERE d.task_id = ? AND t.status NOT IN ('deployed', 'tested')
    `;
    return await this.all(sql, [taskId]);
  }

  async checkForCycle(taskId, dependsOnTaskId) {
    const visited = new Set();
    const stack = [dependsOnTaskId];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = await this.all('SELECT depends_on_task_id FROM dependencies WHERE task_id = ?', [current]);
      for (const dep of deps) {
        stack.push(dep.depends_on_task_id);
      }
    }

    return false;
  }

  async dependencyExists(taskId, dependsOnTaskId) {
    const sql = 'SELECT 1 FROM dependencies WHERE task_id = ? AND depends_on_task_id = ?';
    const existing = await this.get(sql, [taskId, dependsOnTaskId]);
    return !!existing;
  }

  async addHistory(taskId, field, oldValue, newValue) {
    const sql = `
      INSERT INTO history (task_id, field, old_value, new_value)
      VALUES (?, ?, ?, ?)
    `;
    return await this.run(sql, [taskId, field, oldValue, newValue]);
  }

  async getTaskHistory(taskId, limit = 50) {
    const sql = `
      SELECT * FROM history
      WHERE task_id = ?
      ORDER BY changed_at DESC
      LIMIT ?
    `;
    return await this.all(sql, [taskId, limit]);
  }

  async getTaskById(taskId) {
    const task = await this.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) return null;

    task.dependencies = await this.getDependencyIds(taskId);
    task.incomplete_dependencies = await this.getIncompleteDependencies(taskId);
    task.history = await this.getTaskHistory(taskId, 20);
    task.tags = task.tags ? JSON.parse(task.tags) : [];
    if (!task.title) {
      task.title = task.description || `Task #${task.id}`;
    }

    return task;
  }

  async getBlockedTasks(projectId = null) {
    let sql = `
      SELECT DISTINCT t.* FROM tasks t
      JOIN dependencies d ON t.id = d.task_id
      JOIN tasks dep ON d.depends_on_task_id = dep.id
      WHERE dep.status NOT IN ('deployed', 'tested')
        AND t.status NOT IN ('deployed')
    `;
    const params = [];

    if (projectId) {
      sql += ' AND t.project_id = ?';
      params.push(projectId);
    }

    sql += ' ORDER BY t.created_at ASC';

    const tasks = await this.all(sql, params);
    for (const task of tasks) {
      task.blocking_tasks = await this.getIncompleteDependencies(task.id);
      task.tags = task.tags ? JSON.parse(task.tags) : [];
      if (!task.title) {
        task.title = task.description || `Task #${task.id}`;
      }
    }

    return tasks;
  }

  async getNextActionable(projectId = null) {
    let sql = `
      SELECT t.* FROM tasks t
      WHERE t.status IN ('pending', 'in-progress', 'blocked')
        AND t.id NOT IN (
          SELECT DISTINCT d.task_id FROM dependencies d
          JOIN tasks dep ON d.depends_on_task_id = dep.id
          WHERE dep.status NOT IN ('deployed', 'tested')
        )
    `;
    const params = [];

    if (projectId) {
      sql += ' AND t.project_id = ?';
      params.push(projectId);
    }

    sql += ` ORDER BY
      CASE t.priority
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      t.created_at ASC`;

    const tasks = await this.all(sql, params);
    return tasks.map((task) => ({
      ...task,
      tags: task.tags ? JSON.parse(task.tags) : [],
      title: task.title || task.description || `Task #${task.id}`
    }));
  }

  async getDependencyStats(projectId) {
    const totalRow = await this.get(`
      SELECT COUNT(*) as total_dependencies
      FROM dependencies d
      JOIN tasks t ON t.id = d.task_id
      WHERE t.project_id = ?
    `, [projectId]);

    const blockedTasks = await this.getBlockedTasks(projectId);
    const actionableTasks = await this.getNextActionable(projectId);

    return {
      total_dependencies: totalRow?.total_dependencies || 0,
      blocked_tasks: blockedTasks.length,
      actionable_tasks: actionableTasks.length
    };
  }

  // Get unique assignees for filtering
  async getAssignees(projectId = null) {
    let sql = 'SELECT DISTINCT assignee FROM tasks WHERE assignee IS NOT NULL AND assignee != ""';
    const params = [];

    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }

    sql += ' ORDER BY assignee';

    const rows = await this.all(sql, params);
    return rows.map(row => row.assignee);
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