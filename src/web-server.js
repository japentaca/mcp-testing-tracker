import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WebServer {
  constructor(port = 3000) {
    this.app = express();
    this.port = port;
    this.db = new Database();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  setupRoutes() {
    // API Routes

    // Test Suites
    this.app.get('/api/suites', async (req, res) => {
      try {
        const { project } = req.query;
        const suites = await this.db.getTestSuites(project);
        res.json(suites);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/suites', async (req, res) => {
      try {
        const { name, project, description } = req.body;

        if (!name) {
          return res.status(400).json({ error: 'Name is required' });
        }

        const id = await this.db.createTestSuite(name, project, description);
        res.status(201).json({
          success: true,
          id,
          message: `Test suite "${name}" created successfully`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/suites/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid suite ID' });
        }

        // Get suite info before deletion
        const suite = await this.db.getTestSuite(id);
        if (!suite) {
          return res.status(404).json({ error: 'Test suite not found' });
        }

        const success = await this.db.deleteTestSuite(id);
        if (success) {
          res.json({
            success: true,
            message: `Test suite "${suite.name}" deleted successfully`
          });
        } else {
          res.status(404).json({ error: 'Test suite not found' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Test Cases
    this.app.get('/api/cases', async (req, res) => {
      try {
        const filters = {};

        // Parse query parameters
        if (req.query.suite_id) filters.suite_id = parseInt(req.query.suite_id);
        if (req.query.status) filters.status = req.query.status;
        if (req.query.priority) filters.priority = req.query.priority;
        if (req.query.category) filters.category = req.query.category;
        if (req.query.search) filters.search = req.query.search;

        const cases = await this.db.getTestCases(filters);
        res.json(cases);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/cases', async (req, res) => {
      try {
        const { suite_id, description, priority = 'medium', category } = req.body;

        if (!suite_id || !description) {
          return res.status(400).json({ error: 'suite_id and description are required' });
        }

        // Verify suite exists
        const suite = await this.db.getTestSuite(suite_id);
        if (!suite) {
          return res.status(404).json({ error: 'Test suite not found' });
        }

        const id = await this.db.addTestCase(suite_id, description, priority, category);
        res.status(201).json({
          success: true,
          id,
          message: 'Test case created successfully'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/api/cases/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid case ID' });
        }

        const updates = {};
        const allowedFields = ['status', 'notes', 'priority', 'category', 'description'];

        for (const field of allowedFields) {
          if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
          }
        }

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: 'No valid fields to update' });
        }

        const success = await this.db.updateTestCase(id, updates);
        if (success) {
          res.json({
            success: true,
            message: 'Test case updated successfully'
          });
        } else {
          res.status(404).json({ error: 'Test case not found' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/cases/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid case ID' });
        }

        const success = await this.db.deleteTestCase(id);
        if (success) {
          res.json({
            success: true,
            message: 'Test case deleted successfully'
          });
        } else {
          res.status(404).json({ error: 'Test case not found' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Test Summary
    this.app.get('/api/summary/:suite_id', async (req, res) => {
      try {
        const suite_id = parseInt(req.params.suite_id);

        if (isNaN(suite_id)) {
          return res.status(400).json({ error: 'Invalid suite ID' });
        }

        // Verify suite exists
        const suite = await this.db.getTestSuite(suite_id);
        if (!suite) {
          return res.status(404).json({ error: 'Test suite not found' });
        }

        const summary = await this.db.getTestSummary(suite_id);
        res.json({
          suite_name: suite.name,
          suite_id: suite_id,
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
    this.app.listen(this.port, () => {
      console.log(`Web server running at http://localhost:${this.port}`);
      console.log(`API endpoints available at http://localhost:${this.port}/api/`);
    });
  }

  async stop() {
    await this.db.close();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('Shutting down web server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down web server...');
  process.exit(0);
});

// Start the web server
const port = process.env.PORT || process.argv[2] || 3000;
const server = new WebServer(parseInt(port));
server.start();