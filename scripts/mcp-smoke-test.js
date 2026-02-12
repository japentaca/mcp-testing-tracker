import { spawn } from 'child_process';
import { once } from 'events';

const SERVER_COMMAND = process.execPath;
const SERVER_ARGS = ['src/mcp-server.js'];
const REQUEST_TIMEOUT_MS = 8000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

class MCPTestClient {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = '';
    this.server = null;
  }

  async start() {
    this.server = spawn(SERVER_COMMAND, SERVER_ARGS, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    this.server.stdout.setEncoding('utf8');
    this.server.stderr.setEncoding('utf8');

    this.server.stdout.on('data', (chunk) => {
      this.stdoutBuffer += chunk;

      let newlineIndex;
      while ((newlineIndex = this.stdoutBuffer.indexOf('\n')) !== -1) {
        const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

        if (!line) continue;

        try {
          const message = JSON.parse(line);
          if (message.id && this.pending.has(message.id)) {
            const { resolve } = this.pending.get(message.id);
            this.pending.delete(message.id);
            resolve(message);
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    this.server.stderr.on('data', (chunk) => {
      process.stderr.write(`[mcp-server] ${chunk}`);
    });

    this.server.on('exit', (code) => {
      for (const [id, callbacks] of this.pending.entries()) {
        callbacks.reject(new Error(`Server exited while waiting response for id=${id}, code=${code}`));
      }
      this.pending.clear();
    });
  }

  async stop() {
    if (!this.server || this.server.killed) return;

    this.server.kill('SIGINT');
    await once(this.server, 'exit');
  }

  call(method, params = {}) {
    const id = this.nextId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting response for id=${id}, method=${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      this.server.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  async callTool(name, args = {}) {
    const response = await this.call('tools/call', {
      name,
      arguments: args
    });

    assert(!response.error, `Tool ${name} returned error: ${response.error?.message}`);
    assert(response.result?.content?.[0]?.text, `Tool ${name} returned empty content`);

    return JSON.parse(response.result.content[0].text);
  }
}

async function runSmokeTest() {
  const client = new MCPTestClient();

  try {
    console.log('Starting MCP server...');
    await client.start();

    console.log('Checking initialize...');
    const initResponse = await client.call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'mcp-smoke-test',
        version: '1.0.0'
      }
    });
    assert(!initResponse.error, `initialize failed: ${initResponse.error?.message}`);
    assert(initResponse.result?.serverInfo?.name === 'mcp-project-tracker', 'Unexpected serverInfo.name');

    console.log('Checking tools/list...');
    const toolsListResponse = await client.call('tools/list', {});
    assert(!toolsListResponse.error, `tools/list failed: ${toolsListResponse.error?.message}`);

    const tools = toolsListResponse.result?.tools || [];
    const toolNames = tools.map((tool) => tool.name);
    const expectedTools = [
      'create_project',
      'list_projects',
      'delete_project',
      'add_task',
      'update_task',
      'get_tasks',
      'get_task_by_id',
      'delete_task',
      'get_project_summary',
      'add_dependency',
      'remove_dependency',
      'get_blocked_tasks',
      'get_next_actionable'
    ];

    for (const toolName of expectedTools) {
      assert(toolNames.includes(toolName), `Missing MCP tool: ${toolName}`);
    }

    console.log('Creating project...');
    const createProject = await client.callTool('create_project', {
      name: 'Smoke Project',
      client: 'VSCode',
      description: 'MCP smoke test'
    });
    assert(createProject.success === true, 'create_project did not return success=true');
    const projectId = createProject.project_id;
    assert(Number.isInteger(projectId) && projectId > 0, 'Invalid project_id from create_project');

    console.log('Adding tasks...');
    const foundationTask = await client.callTool('add_task', {
      project_id: projectId,
      title: 'Foundation',
      description: 'Prepare baseline',
      priority: 'critical',
      category: 'setup',
      assignee: 'copilot',
      due_date: '2026-12-31',
      tags: ['base']
    });
    assert(foundationTask.success === true, 'foundation add_task failed');
    const foundationTaskId = foundationTask.task_id;

    const integrationTask = await client.callTool('add_task', {
      project_id: projectId,
      title: 'Integration',
      description: 'Validate MCP end-to-end',
      priority: 'high',
      category: 'integration',
      assignee: 'copilot',
      due_date: '2026-12-31',
      tags: ['mcp', 'smoke']
    });
    assert(integrationTask.success === true, 'integration add_task failed');
    const taskId = integrationTask.task_id;
    assert(Number.isInteger(taskId) && taskId > 0, 'Invalid task_id from add_task');

    console.log('Adding dependency...');
    const addDependency = await client.callTool('add_dependency', {
      task_id: taskId,
      depends_on_task_id: foundationTaskId
    });
    assert(addDependency.success === true, 'add_dependency did not return success=true');

    console.log('Checking blocked tasks...');
    const blocked = await client.callTool('get_blocked_tasks', { project_id: projectId });
    assert(Array.isArray(blocked.tasks), 'get_blocked_tasks did not return tasks');
    assert(blocked.tasks.some((task) => task.id === taskId), 'Dependent task should be blocked');

    console.log('Updating task...');
    const updateTask = await client.callTool('update_task', {
      id: foundationTaskId,
      status: 'tested',
      notes: 'dependency resolved'
    });
    assert(updateTask.success === true, 'update_task did not return success=true');

    console.log('Checking actionable tasks...');
    const actionable = await client.callTool('get_next_actionable', { project_id: projectId });
    assert(Array.isArray(actionable.tasks), 'get_next_actionable did not return tasks');
    assert(actionable.tasks.some((task) => task.id === taskId), 'Integration task should become actionable');

    console.log('Fetching tasks...');
    const getTasks = await client.callTool('get_tasks', {
      project_id: projectId
    });
    assert(Array.isArray(getTasks.tasks), 'get_tasks did not return tasks array');
    assert(getTasks.tasks.some((task) => task.id === taskId), 'Created integration task not found in get_tasks');

    console.log('Fetching task detail...');
    const taskDetail = await client.callTool('get_task_by_id', { id: taskId });
    assert(taskDetail.id === taskId, 'get_task_by_id returned wrong task');
    assert(Array.isArray(taskDetail.history), 'Task detail should include history');
    assert(Array.isArray(taskDetail.dependencies), 'Task detail should include dependencies');

    console.log('Fetching summary...');
    const summary = await client.callTool('get_project_summary', {
      project_id: projectId
    });
    assert(summary.project_id === projectId, 'Summary project_id mismatch');
    assert(summary.summary?.total >= 1, 'Summary total should be >= 1');
    assert(summary.summary?.dependency_stats, 'Summary should include dependency_stats');

    console.log('Deleting tasks...');
    const deleteTask = await client.callTool('delete_task', { id: taskId });
    const deleteTask2 = await client.callTool('delete_task', { id: foundationTaskId });
    assert(deleteTask.success === true, 'delete_task did not return success=true');
    assert(deleteTask2.success === true, 'delete_task foundation did not return success=true');

    console.log('Deleting project...');
    const deleteProject = await client.callTool('delete_project', { id: projectId });
    assert(deleteProject.success === true, 'delete_project did not return success=true');

    console.log('✅ MCP smoke test passed');
  } finally {
    await client.stop();
  }
}

runSmokeTest().catch((error) => {
  console.error(`❌ MCP smoke test failed: ${error.message}`);
  process.exit(1);
});
