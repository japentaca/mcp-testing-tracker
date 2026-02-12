# MCP Project Tracker

Proyecto en desarrollo para gestión de proyectos y tareas con servidor MCP, API REST y UI web sobre SQLite.

## Estado

Uso local / desarrollo. No orientado a producción en esta etapa.

## Stack

- MCP server por `stdio` usando `@modelcontextprotocol/sdk`
- API web con Express
- Persistencia con SQLite (`sqlite3`)
- Frontend vanilla (`public/`)

## Instalación

```bash
npm install
```

## Scripts

```bash
npm run start:mcp        # Inicia solo el servidor MCP
npm run start:web        # Inicia web en puerto por defecto (3000)
npm run start:web:3001   # Inicia web en puerto 3001
npm run start:web:8080   # Inicia web en puerto 8080
npm run dev              # MCP + web (3000)
npm run dev:3001         # MCP + web (3001)
```

## Tests

```bash
npm test                 # Jest (unit tests)
npm run test:mcp         # Smoke test MCP end-to-end
```

## MCP Tools (13)

1. `create_project`
2. `list_projects`
3. `delete_project`
4. `add_task`
5. `update_task`
6. `get_tasks`
7. `get_task_by_id`
8. `delete_task`
9. `get_project_summary`
10. `add_dependency`
11. `remove_dependency`
12. `get_blocked_tasks`
13. `get_next_actionable`

## API REST

### Health

- `GET /api/health`

### Proyectos

- `GET /api/projects`
- `POST /api/projects`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`

### Tareas

- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `GET /api/tasks/:id/detail`
- `GET /api/tasks/:id/history`

### Dependencias

- `GET /api/tasks/:id/dependencies`
- `POST /api/tasks/:id/dependencies`
- `DELETE /api/tasks/:id/dependencies/:depId`

### Consultas avanzadas

- `GET /api/tasks/blocked?project_id=<id>`
- `GET /api/tasks/actionable?project_id=<id>`

### Resumen

- `GET /api/summary/:project_id`

## Modelo de tarea

Campos principales en `tasks`:

- `id`, `project_id`
- `title`, `description`
- `priority`, `status`
- `category`, `assignee`, `due_date`
- `tags`, `notes`, `completed_at`
- `created_at`, `updated_at`
