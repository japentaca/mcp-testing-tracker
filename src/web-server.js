import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from './database.js';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WebServer {
  constructor(port = config.port) {
    this.app = express();
    this.port = port;
    this.db = new Database();
    this.server = null;
    this.init();
  }

  async init() {
    // Wait for database to be ready
    await this.db.ready;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Security headers
    this.app.use(helmet());

    // Restrict CORS to configured origins
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin || config.cors.origins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    }));

    // Logging
    this.app.use(morgan(config.logging.format));

    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  setupRoutes() {
    // Health Check
    this.app.get('/api/health', async (req, res) => {
      try {
        // Test database connection
        await this.db.all('SELECT 1');
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          database: 'connected'
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          database: 'disconnected',
          error: error.message
        });
      }
    });

    // API Routes

    // Projects
    this.app.get('/api/projects', async (req, res) => {
      try {
        const { client } = req.query;
        const projects = await this.db.getProjects(client);
        res.json(projects);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/projects', async (req, res) => {
      try {
        const { name, client, description } = req.body;

        if (!name) {
          return res.status(400).json({ error: 'Name is required' });
        }

        const id = await this.db.createProject(name, client, description);
        res.status(201).json({
          success: true,
          id,
          message: `Project "${name}" created successfully`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/api/projects/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid project ID' });
        }

        const updates = {};
        const allowedFields = ['name', 'client', 'description'];

        for (const field of allowedFields) {
          if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
          }
        }

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: 'No valid fields to update' });
        }

        const success = await this.db.updateProject(id, updates);
        if (success) {
          res.json({
            success: true,
            message: 'Project updated successfully'
          });
        } else {
          res.status(404).json({ error: 'Project not found' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/projects/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid project ID' });
        }

        // Get project info before deletion
        const project = await this.db.getProject(id);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const success = await this.db.deleteProject(id);
        if (success) {
          res.json({
            success: true,
            message: `Project "${project.name}" deleted successfully`
          });
        } else {
          res.status(404).json({ error: 'Project not found' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Tasks
    this.app.get('/api/tasks', async (req, res) => {
      try {
        const filters = {};

        // Parse query parameters
        if (req.query.project_id) filters.project_id = parseInt(req.query.project_id);
        if (req.query.status) filters.status = req.query.status;
        if (req.query.priority) filters.priority = req.query.priority;
        if (req.query.category) filters.category = req.query.category;
        if (req.query.assignee) filters.assignee = req.query.assignee;
        if (req.query.search) filters.search = req.query.search;

        const tasks = await this.db.getTasks(filters);
        res.json(tasks);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/tasks/blocked', async (req, res) => {
      try {
        const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;
        const tasks = await this.db.getBlockedTasks(projectId);
        res.json(tasks);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/tasks/actionable', async (req, res) => {
      try {
        const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;
        const tasks = await this.db.getNextActionable(projectId);
        res.json(tasks);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/tasks', async (req, res) => {
      try {
        const {
          project_id,
          title,
          description = null,
          priority = 'medium',
          category,
          assignee,
          due_date,
          tags = null,
          depends_on = []
        } = req.body;

        if (!project_id || !(title || description)) {
          return res.status(400).json({ error: 'project_id and title are required' });
        }

        // Verify project exists
        const project = await this.db.getProject(project_id);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const id = await this.db.addTask(
          project_id,
          title || description,
          description,
          priority,
          category,
          assignee,
          due_date,
          tags,
          []
        );

        for (const depId of depends_on) {
          if (id === depId) {
            return res.status(400).json({ error: 'A task cannot depend on itself' });
          }
          if (await this.db.checkForCycle(id, depId)) {
            return res.status(400).json({ error: 'Adding this dependency would create a cycle' });
          }
          await this.db.addDependency(id, depId);
        }

        res.status(201).json({
          success: true,
          id,
          message: 'Task created successfully'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/api/tasks/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid task ID' });
        }

        const updates = {};
        const allowedFields = ['status', 'notes', 'priority', 'category', 'description', 'title', 'assignee', 'due_date', 'tags'];

        for (const field of allowedFields) {
          if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
          }
        }

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: 'No valid fields to update' });
        }

        const success = await this.db.updateTask(id, updates);
        if (success) {
          res.json({
            success: true,
            message: 'Task updated successfully'
          });
        } else {
          res.status(404).json({ error: 'Task not found' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/tasks/:id/detail', async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid task ID' });
        }

        const task = await this.db.getTaskById(id);
        if (!task) {
          return res.status(404).json({ error: 'Task not found' });
        }

        res.json(task);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/tasks/:id/history', async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid task ID' });
        }

        const history = await this.db.getTaskHistory(id, 50);
        res.json(history);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/tasks/:id/dependencies', async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid task ID' });
        }

        const dependencies = await this.db.getTaskDependencies(id);
        res.json(dependencies);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/tasks/:id/dependencies', async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const depId = parseInt(req.body.depends_on_task_id, 10);

        if (isNaN(id) || isNaN(depId)) {
          return res.status(400).json({ error: 'Invalid task IDs' });
        }

        if (id === depId) {
          return res.status(400).json({ error: 'A task cannot depend on itself' });
        }

        if (await this.db.dependencyExists(id, depId)) {
          return res.status(200).json({ success: true, message: 'Dependency already exists' });
        }

        if (await this.db.checkForCycle(id, depId)) {
          return res.status(400).json({ error: 'Adding this dependency would create a cycle' });
        }

        await this.db.addDependency(id, depId);
        res.status(201).json({ success: true, message: 'Dependency added' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/tasks/:id/dependencies/:depId', async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const depId = parseInt(req.params.depId, 10);

        if (isNaN(id) || isNaN(depId)) {
          return res.status(400).json({ error: 'Invalid task IDs' });
        }

        const removed = await this.db.removeDependency(id, depId);
        if (!removed) {
          return res.status(404).json({ error: 'Dependency not found' });
        }

        res.json({ success: true, message: 'Dependency removed' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/tasks/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid task ID' });
        }

        const success = await this.db.deleteTask(id);
        if (success) {
          res.json({
            success: true,
            message: 'Task deleted successfully'
          });
        } else {
          res.status(404).json({ error: 'Task not found' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Project Summary
    this.app.get('/api/summary/:project_id', async (req, res) => {
      try {
        const project_id = parseInt(req.params.project_id);

        if (isNaN(project_id)) {
          return res.status(400).json({ error: 'Invalid project ID' });
        }

        // Verify project exists
        const project = await this.db.getProject(project_id);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const summary = await this.db.getProjectSummary(project_id);
        res.json({
          project_name: project.name,
          project_id,
          summary
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Serve the main app for any non-API routes
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log(`Web server running at http://localhost:${this.port}`);
      console.log(`API endpoints available at http://localhost:${this.port}/api/`);
    });
  }

  async stop() {
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
    await this.db.close();
  }
}

// Handle process termination
let webServer;

process.on('SIGINT', async () => {
  console.log('Shutting down web server...');
  if (webServer) {
    await webServer.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down web server...');
  if (webServer) {
    await webServer.stop();
  }
  process.exit(0);
});

// Start the web server
const port = parseInt(process.argv[2]) || config.port;
webServer = new WebServer(port);
webServer.start();