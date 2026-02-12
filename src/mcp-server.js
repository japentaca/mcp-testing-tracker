#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from './database.js';

const VALID_STATUSES = ['pending', 'in-progress', 'developed', 'tested', 'deployed', 'blocked'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

const db = new Database();
await db.ready;

const server = new Server(
  { name: 'mcp-project-tracker', version: '3.0.0' },
  { capabilities: { tools: {} } }
);

function validateId(id, field = 'id') {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function validateStatus(status) {
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
}

function validatePriority(priority) {
  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    throw new Error(`Invalid priority: ${priority}`);
  }
}

function textResult(payload) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

const tools = [
  {
    name: 'create_project',
    description: 'Create a new project (name, client, description)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        client: { type: 'string', description: 'Client name (optional)' },
        description: { type: 'string', description: 'Project description (optional)' }
      },
      required: ['name']
    }
  },
  {
    name: 'list_projects',
    description: 'List all projects with metadata and counters',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Filter by client (optional)' }
      }
    }
  },
  {
    name: 'delete_project',
    description: 'Delete a project and all related tasks',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Project ID to delete' }
      },
      required: ['id']
    }
  },
  {
    name: 'add_task',
    description: 'Add a new task to a project',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Project ID' },
        title: { type: 'string', description: 'Short task title' },
        description: { type: 'string', description: 'Detailed task description (optional)' },
        priority: { type: 'string', enum: VALID_PRIORITIES },
        category: { type: 'string', description: 'Task category (optional)' },
        assignee: { type: 'string', description: 'Task assignee (optional)' },
        due_date: { type: 'string', description: 'Due date YYYY-MM-DD (optional)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags (optional)' },
        depends_on: { type: 'array', items: { type: 'number' }, description: 'Dependency task IDs (optional)' }
      },
      required: ['project_id', 'title']
    }
  },
  {
    name: 'update_task',
    description: 'Update fields of a task with history tracking',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Task ID' },
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        status: { type: 'string', enum: VALID_STATUSES },
        notes: { type: 'string', description: 'Notes to append with timestamp' },
        priority: { type: 'string', enum: VALID_PRIORITIES },
        category: { type: 'string' },
        assignee: { type: 'string' },
        due_date: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['id']
    }
  },
  {
    name: 'get_tasks',
    description: 'Get filtered tasks',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number' },
        status: { type: 'string', enum: VALID_STATUSES },
        priority: { type: 'string', enum: VALID_PRIORITIES },
        category: { type: 'string' },
        assignee: { type: 'string' },
        search: { type: 'string' }
      }
    }
  },
  {
    name: 'get_task_by_id',
    description: 'Get full details of a task including dependencies and history',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Task ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_task',
    description: 'Delete a task',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Task ID to delete' }
      },
      required: ['id']
    }
  },
  {
    name: 'get_project_summary',
    description: 'Get summary statistics of a project including dependency stats',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Project ID' }
      },
      required: ['project_id']
    }
  },
  {
    name: 'add_dependency',
    description: 'Add a dependency between two tasks (task depends on another task)',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID of dependent task' },
        depends_on_task_id: { type: 'number', description: 'ID of dependency task' }
      },
      required: ['task_id', 'depends_on_task_id']
    }
  },
  {
    name: 'remove_dependency',
    description: 'Remove a dependency between two tasks',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID of dependent task' },
        depends_on_task_id: { type: 'number', description: 'ID of dependency task' }
      },
      required: ['task_id', 'depends_on_task_id']
    }
  },
  {
    name: 'get_blocked_tasks',
    description: 'Get all tasks blocked by incomplete dependencies',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Optional project filter' }
      }
    }
  },
  {
    name: 'get_next_actionable',
    description: 'Get tasks ready to work on (no incomplete dependencies)',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Optional project filter' }
      }
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'create_project': {
        const { name: projectName, client = null, description = null } = args;
        if (!projectName || typeof projectName !== 'string') {
          throw new Error('name is required');
        }
        const projectId = await db.createProject(projectName, client, description);
        return textResult({ success: true, project_id: projectId, message: `Project "${projectName}" created` });
      }

      case 'list_projects': {
        const projects = await db.getProjects(args.client || null);
        return textResult({ projects });
      }

      case 'delete_project': {
        validateId(args.id, 'id');
        const project = await db.getProject(args.id);
        if (!project) throw new Error(`Project ${args.id} not found`);
        await db.deleteProject(args.id);
        return textResult({ success: true, message: `Project "${project.name}" deleted` });
      }

      case 'add_task': {
        const {
          project_id,
          title,
          description = null,
          priority = 'medium',
          category = null,
          assignee = null,
          due_date = null,
          tags = null,
          depends_on = []
        } = args;

        validateId(project_id, 'project_id');
        validatePriority(priority);
        if (!title || typeof title !== 'string') {
          throw new Error('title is required');
        }

        const project = await db.getProject(project_id);
        if (!project) throw new Error(`Project ${project_id} not found`);

        for (const depId of depends_on) {
          validateId(depId, 'depends_on item');
        }

        const taskId = await db.addTask(project_id, title, description, priority, category, assignee, due_date, tags, []);

        for (const depId of depends_on) {
          if (depId === taskId) {
            throw new Error('A task cannot depend on itself');
          }
          const depTask = await db.getTaskById(depId);
          if (!depTask) {
            throw new Error(`Dependency task ${depId} not found`);
          }
          if (await db.checkForCycle(taskId, depId)) {
            throw new Error('Adding this dependency would create a cycle');
          }
          await db.addDependency(taskId, depId);
        }

        return textResult({ success: true, task_id: taskId, message: `Task ${taskId} created` });
      }

      case 'update_task': {
        validateId(args.id, 'id');
        validateStatus(args.status);
        validatePriority(args.priority);

        const current = await db.getTaskById(args.id);
        if (!current) throw new Error(`Task ${args.id} not found`);

        const updates = {};
        const mutable = ['title', 'description', 'status', 'priority', 'category', 'assignee', 'due_date', 'tags'];
        for (const field of mutable) {
          if (args[field] !== undefined) {
            updates[field] = args[field];
          }
        }

        if (args.notes !== undefined) {
          const timestamp = new Date().toISOString();
          const appended = `[${timestamp}] ${args.notes}`;
          updates.notes = current.notes ? `${current.notes}\n${appended}` : appended;
        }

        if (updates.status === 'deployed') {
          const incomplete = await db.getIncompleteDependencies(args.id);
          if (incomplete.length > 0) {
            throw new Error(`Cannot set status to deployed: ${incomplete.length} incomplete dependencies`);
          }
        }

        const success = await db.updateTask(args.id, updates);
        if (!success) throw new Error(`Task ${args.id} not found`);

        return textResult({ success: true, message: `Task ${args.id} updated` });
      }

      case 'get_tasks': {
        if (args.project_id !== undefined) validateId(args.project_id, 'project_id');
        validateStatus(args.status);
        validatePriority(args.priority);
        const tasks = await db.getTasks(args);
        return textResult({ tasks });
      }

      case 'get_task_by_id': {
        validateId(args.id, 'id');
        const task = await db.getTaskById(args.id);
        if (!task) throw new Error(`Task ${args.id} not found`);
        return textResult(task);
      }

      case 'delete_task': {
        validateId(args.id, 'id');
        const success = await db.deleteTask(args.id);
        if (!success) throw new Error(`Task ${args.id} not found`);
        return textResult({ success: true, message: `Task ${args.id} deleted` });
      }

      case 'get_project_summary': {
        validateId(args.project_id, 'project_id');
        const project = await db.getProject(args.project_id);
        if (!project) throw new Error(`Project ${args.project_id} not found`);
        const summary = await db.getProjectSummary(args.project_id);
        return textResult({ project_id: args.project_id, project_name: project.name, summary });
      }

      case 'add_dependency': {
        validateId(args.task_id, 'task_id');
        validateId(args.depends_on_task_id, 'depends_on_task_id');
        if (args.task_id === args.depends_on_task_id) {
          throw new Error('A task cannot depend on itself');
        }

        const task = await db.getTaskById(args.task_id);
        const depTask = await db.getTaskById(args.depends_on_task_id);
        if (!task) throw new Error(`Task ${args.task_id} not found`);
        if (!depTask) throw new Error(`Task ${args.depends_on_task_id} not found`);

        if (await db.dependencyExists(args.task_id, args.depends_on_task_id)) {
          return textResult({ success: true, message: 'Dependency already exists' });
        }

        if (await db.checkForCycle(args.task_id, args.depends_on_task_id)) {
          throw new Error('Adding this dependency would create a cycle');
        }

        await db.addDependency(args.task_id, args.depends_on_task_id);
        return textResult({ success: true, message: `Task ${args.task_id} now depends on ${args.depends_on_task_id}` });
      }

      case 'remove_dependency': {
        validateId(args.task_id, 'task_id');
        validateId(args.depends_on_task_id, 'depends_on_task_id');
        const removed = await db.removeDependency(args.task_id, args.depends_on_task_id);
        if (!removed) throw new Error('Dependency not found');
        return textResult({ success: true, message: 'Dependency removed' });
      }

      case 'get_blocked_tasks': {
        if (args.project_id !== undefined) validateId(args.project_id, 'project_id');
        const tasks = await db.getBlockedTasks(args.project_id || null);
        return textResult({ tasks });
      }

      case 'get_next_actionable': {
        if (args.project_id !== undefined) validateId(args.project_id, 'project_id');
        const tasks = await db.getNextActionable(args.project_id || null);
        return textResult({ tasks });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return textResult({ success: false, error: error.message });
  }
});

process.on('SIGINT', async () => {
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await db.close();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
