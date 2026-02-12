# MCP Project Tracker

Servidor MCP (Model Context Protocol) para gestionar **proyectos y tareas** con persistencia SQLite, API REST e interfaz web.

## 🚀 Características

- Servidor MCP por `stdio`.
- Base de datos SQLite con esquema simple y eficiente.
- API REST para proyectos y tareas.
- UI web (HTML/CSS/JavaScript vanilla).
- Estados de tarea: `pending`, `in-progress`, `developed`, `tested`, `deployed`, `blocked`.
- Prioridades: `low`, `medium`, `high`, `critical`.
- Filtros por estado, prioridad, categoría, responsable y texto.
- Campos extra de seguimiento: `assignee` y `due_date`.

## 📁 Estructura

```text
mcp-project-tracker/
├── package.json
├── README.md
├── src/
│   ├── mcp-server.js
│   ├── web-server.js
│   ├── database.js
│   └── schema.sql
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── scripts/
    └── mcp-smoke-test.js
```

## 🛠️ Instalación

```bash
npm install
```

La base de datos se crea automáticamente al iniciar cualquiera de los servidores.

## ▶️ Ejecución

### Servidor MCP

```bash
npm run start:mcp
```

### Servidor Web

```bash
npm run start:web
# o
npm run start:web:3001
npm run start:web:8080
```

UI: `http://localhost:3000` (o el puerto que uses).

### Ambos en desarrollo

```bash
npm run dev
# o
npm run dev:3001
```

## ✅ Tests

### Tests unitarios (Jest)

```bash
npm test
```

### Smoke test MCP real (cliente MCP por stdio)

Este test levanta el servidor MCP y ejecuta un flujo real JSON-RPC:
- `initialize`
- `tools/list`
- `create_project`
- `add_task`
- `update_task`
- `get_tasks`
- `get_project_summary`
- `delete_task`
- `delete_project`

```bash
npm run test:mcp
```

## 🌐 API REST

### Proyectos

- `GET /api/projects` — listar proyectos.
- `POST /api/projects` — crear proyecto.
- `PUT /api/projects/:id` — actualizar proyecto.
- `DELETE /api/projects/:id` — eliminar proyecto.

### Tareas

- `GET /api/tasks` — listar tareas (con filtros).
- `POST /api/tasks` — crear tarea.
- `PUT /api/tasks/:id` — actualizar tarea.
- `DELETE /api/tasks/:id` — eliminar tarea.

### Resumen

- `GET /api/summary/:project_id` — estadísticas del proyecto.

### Health

- `GET /api/health` — estado del servicio.

### Filtros disponibles en `GET /api/tasks`

- `project_id`
- `status`
- `priority`
- `category`
- `assignee`
- `search`

## 🤖 Herramientas MCP

El servidor expone estas herramientas:

- `create_project`
- `list_projects`
- `add_task`
- `update_task`
- `get_tasks`
- `get_project_summary`
- `delete_task`
- `delete_project`

### Esquema resumido de parámetros

#### `create_project`
- `name` (requerido)
- `client` (opcional)
- `description` (opcional)

#### `list_projects`
- `client` (opcional)

#### `add_task`
- `project_id` (requerido)
- `description` (requerido)
- `priority` (opcional)
- `category` (opcional)
- `assignee` (opcional)
- `due_date` (opcional, `YYYY-MM-DD`)

#### `update_task`
- `id` (requerido)
- `status` (opcional)
- `notes` (opcional)
- `priority` (opcional)
- `category` (opcional)
- `description` (opcional)
- `assignee` (opcional)
- `due_date` (opcional, `YYYY-MM-DD`)

#### `get_tasks`
- `project_id` (opcional)
- `status` (opcional)
- `priority` (opcional)
- `category` (opcional)
- `assignee` (opcional)
- `search` (opcional)

#### `get_project_summary`
- `project_id` (requerido)

#### `delete_task`
- `id` (requerido)

#### `delete_project`
- `id` (requerido)

## ⚙️ Configuración MCP en VS Code

Agrega esto a tu configuración JSON de usuario:

```json
{
  "github.copilot.chat.mcp.servers": {
    "project-tracker": {
      "command": "node",
      "args": ["c:\\ruta\\completa\\al\\proyecto\\src\\mcp-server.js"],
      "env": {}
    }
  }
}
```

Notas:
- En Windows usa `\\` en rutas o `/`.
- Reinicia VS Code tras cambiar la configuración.

## 🗃️ Modelo de datos

### Tabla `projects`
- `id`
- `name`
- `client`
- `description`
- `created_at`
- `updated_at`

### Tabla `tasks`
- `id`
- `project_id` (FK a `projects.id`)
- `description`
- `priority`
- `status`
- `category`
- `assignee`
- `due_date`
- `notes`
- `created_at`
- `updated_at`

Índices principales:
- `idx_tasks_project`
- `idx_tasks_status`
- `idx_tasks_priority`
- `idx_tasks_category`
- `idx_tasks_assignee`
- `idx_tasks_due_date`

## 🧪 Ejemplos de prompts (Copilot Chat)

- "Crea un proyecto llamado Portal de Ventas para el cliente ACME"
- "Agrega una tarea de prioridad high para implementar autenticación"
- "Muéstrame todas las tareas blocked del proyecto 1"
- "Marca la tarea 5 como tested"
- "Dame un resumen del proyecto 1"

---

Proyecto listo para seguimiento de ciclo completo: planificación, desarrollo, validación y despliegue.
