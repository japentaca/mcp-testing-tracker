#!/usr/bin/env node

import Database from './database.js';

class MCPServer {
  constructor() {
    this.db = new Database();
    this.setupMessageHandling();
  }

  setupMessageHandling() {
    process.stdin.on('data', async (data) => {
      try {
        const message = JSON.parse(data.toString().trim());
        const response = await this.handleMessage(message);
        this.sendResponse(response);
      } catch (error) {
        this.sendError(error.message);
      }
    });
  }

  async handleMessage(message) {
    const { method, params = {}, id } = message;

    switch (method) {
      case 'initialize':
        return this.handleInitialize(id);

      case 'tools/list':
        return this.handleToolsList(id);

      case 'tools/call':
        return await this.handleToolCall(params, id);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  handleInitialize(id) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'mcp-testing-server',
          version: '1.0.0'
        }
      }
    };
  }

  handleToolsList(id) {
    const tools = [
      {
        name: 'create_test_suite',
        description: 'Create a new test suite',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the test suite' },
            project: { type: 'string', description: 'Project name (optional)' },
            description: { type: 'string', description: 'Suite description (optional)' }
          },
          required: ['name']
        }
      },
      {
        name: 'list_test_suites',
        description: 'List all test suites with metadata and counts',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Filter by project name (optional)' }
          }
        }
      },
      {
        name: 'add_test_case',
        description: 'Add a new test case to a suite',
        inputSchema: {
          type: 'object',
          properties: {
            suite_id: { type: 'number', description: 'ID of the test suite' },
            description: { type: 'string', description: 'Test case description' },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Test case priority'
            },
            category: { type: 'string', description: 'Test case category (optional)' }
          },
          required: ['suite_id', 'description']
        }
      },
      {
        name: 'update_test_case',
        description: 'Update an existing test case',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Test case ID' },
            status: {
              type: 'string',
              enum: ['pending', 'passed', 'failed', 'blocked', 'skipped'],
              description: 'Test case status'
            },
            notes: { type: 'string', description: 'Test case notes (optional)' },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Test case priority (optional)'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'get_test_cases',
        description: 'Get filtered test cases',
        inputSchema: {
          type: 'object',
          properties: {
            suite_id: { type: 'number', description: 'Filter by suite ID (optional)' },
            status: {
              type: 'string',
              enum: ['pending', 'passed', 'failed', 'blocked', 'skipped'],
              description: 'Filter by status (optional)'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Filter by priority (optional)'
            },
            category: { type: 'string', description: 'Filter by category (optional)' },
            search: { type: 'string', description: 'Search in description and notes (optional)' }
          }
        }
      },
      {
        name: 'get_test_summary',
        description: 'Get test summary statistics for a suite',
        inputSchema: {
          type: 'object',
          properties: {
            suite_id: { type: 'number', description: 'Test suite ID' }
          },
          required: ['suite_id']
        }
      },
      {
        name: 'delete_test_case',
        description: 'Delete a test case',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Test case ID to delete' }
          },
          required: ['id']
        }
      },
      {
        name: 'delete_test_suite',
        description: 'Delete a test suite and all its test cases',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Test suite ID to delete' }
          },
          required: ['id']
        }
      }
    ];

    return {
      jsonrpc: '2.0',
      id,
      result: { tools }
    };
  }

  async handleToolCall(params, id) {
    const { name, arguments: args } = params;

    try {
      let result;

      switch (name) {
        case 'create_test_suite':
          result = await this.createTestSuite(args);
          break;

        case 'list_test_suites':
          result = await this.listTestSuites(args);
          break;

        case 'add_test_case':
          result = await this.addTestCase(args);
          break;

        case 'update_test_case':
          result = await this.updateTestCase(args);
          break;

        case 'get_test_cases':
          result = await this.getTestCases(args);
          break;

        case 'get_test_summary':
          result = await this.getTestSummary(args);
          break;

        case 'delete_test_case':
          result = await this.deleteTestCase(args);
          break;

        case 'delete_test_suite':
          result = await this.deleteTestSuite(args);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: error.message
        }
      };
    }
  }

  // Tool implementations
  async createTestSuite(args) {
    const { name, project, description } = args;
    const id = await this.db.createTestSuite(name, project, description);
    return {
      success: true,
      suite_id: id,
      message: `Test suite "${name}" created with ID ${id}`
    };
  }

  async listTestSuites(args) {
    const { project } = args;
    const suites = await this.db.getTestSuites(project);
    return { suites };
  }

  async addTestCase(args) {
    const { suite_id, description, priority = 'medium', category } = args;

    // Verify suite exists
    const suite = await this.db.getTestSuite(suite_id);
    if (!suite) {
      throw new Error(`Test suite with ID ${suite_id} not found`);
    }

    const id = await this.db.addTestCase(suite_id, description, priority, category);
    return {
      success: true,
      case_id: id,
      message: `Test case added with ID ${id} to suite "${suite.name}"`
    };
  }

  async updateTestCase(args) {
    const { id, ...updates } = args;
    const success = await this.db.updateTestCase(id, updates);

    if (!success) {
      throw new Error(`Test case with ID ${id} not found`);
    }

    return {
      success: true,
      message: `Test case ${id} updated successfully`
    };
  }

  async getTestCases(args) {
    const cases = await this.db.getTestCases(args);
    return { test_cases: cases };
  }

  async getTestSummary(args) {
    const { suite_id } = args;

    // Verify suite exists
    const suite = await this.db.getTestSuite(suite_id);
    if (!suite) {
      throw new Error(`Test suite with ID ${suite_id} not found`);
    }

    const summary = await this.db.getTestSummary(suite_id);
    return {
      suite_name: suite.name,
      suite_id: suite_id,
      summary
    };
  }

  async deleteTestCase(args) {
    const { id } = args;
    const success = await this.db.deleteTestCase(id);

    if (!success) {
      throw new Error(`Test case with ID ${id} not found`);
    }

    return {
      success: true,
      message: `Test case ${id} deleted successfully`
    };
  }

  async deleteTestSuite(args) {
    const { id } = args;

    // Verify suite exists
    const suite = await this.db.getTestSuite(id);
    if (!suite) {
      throw new Error(`Test suite with ID ${id} not found`);
    }

    const success = await this.db.deleteTestSuite(id);
    return {
      success: true,
      message: `Test suite "${suite.name}" and all its test cases deleted successfully`
    };
  }

  sendResponse(response) {
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  sendError(message) {
    const error = {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message
      }
    };
    process.stdout.write(JSON.stringify(error) + '\n');
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.error('Shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down MCP server...');
  process.exit(0);
});

// Start the MCP server
const server = new MCPServer();
console.error('MCP Testing Server started');