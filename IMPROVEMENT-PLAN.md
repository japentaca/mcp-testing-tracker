# Plan de Implementación - Correcciones y Mejoras

## MCP Testing Tracker v2.0

**Fecha**: Febrero 2026  
**Estado**: Planificación  
**Autor**: Generado por análisis de código

---

## Resumen Ejecutivo

Este documento describe el plan de correcciones y mejoras para el MCP Testing Tracker, organizado en fases incrementales. Cada fase es independiente y desplegable, priorizando primero la corrección de bugs y riesgos de datos, luego seguridad, y finalmente mejoras funcionales.

---

## Fase 1 — Correcciones Críticas (Bugs y Riesgos de Datos)

> **Prioridad**: URGENTE  
> **Impacto**: Prevención de pérdida/corrupción de datos y fallos silenciosos

### 1.1 Habilitar Foreign Keys en SQLite

**Problema**: SQLite no aplica foreign keys por defecto. El `ON DELETE CASCADE` definido en `schema.sql` no funciona, lo que puede dejar test cases huérfanos al eliminar suites.

**Solución**: Ejecutar `PRAGMA foreign_keys = ON` al inicializar la conexión, antes del schema.

**Archivos afectados**: `src/database.js`

---

### 1.2 Fix del Buffer de stdin en MCP Server

**Problema**: `process.stdin.on('data')` asume que cada evento `data` contiene exactamente un mensaje JSON completo. En la práctica, un mensaje puede llegar fragmentado en múltiples chunks, o múltiples mensajes pueden concatenarse en un solo chunk. Esto causa errores de parseo intermitentes.

**Solución**: Implementar un buffer que acumule chunks y procese líneas completas (protocolo JSON-RPC delimitado por newline).

**Archivos afectados**: `src/mcp-server.js`

---

### 1.3 Fix de `sendError` sin ID de Request

**Problema**: El método `sendError()` genera respuestas de error sin el campo `id` de la request original. Según JSON-RPC 2.0, el `id` es obligatorio para que el cliente pueda correlacionar la respuesta. Sin él, los clientes MCP descartan el error silenciosamente.

**Solución**: Propagar el `id` del mensaje original al método `sendError()`.

**Archivos afectados**: `src/mcp-server.js`

---

### 1.4 Agregar Ruta PUT para Edición de Suites

**Problema**: El frontend envía `PUT /api/suites/:id` para editar suites, pero esa ruta no existe en el web server. La edición de suites falla silenciosamente (el modal se cierra pero no guarda cambios).

**Solución**: Agregar endpoint `PUT /api/suites/:id` en el web server y método `updateTestSuite()` en la capa de base de datos.

**Archivos afectados**: `src/web-server.js`, `src/database.js`

---

### 1.5 Graceful Shutdown con Cierre de Base de Datos

**Problema**: Los handlers `SIGINT`/`SIGTERM` en ambos servidores llaman a `process.exit(0)` sin cerrar la conexión a SQLite. Esto puede causar escrituras parciales o corrupción del archivo `.db`.

**Solución**: Llamar a `db.close()` antes de `process.exit()` en ambos servidores. Asegurar que la instancia del server/db sea accesible desde los handlers.

**Archivos afectados**: `src/mcp-server.js`, `src/web-server.js`

---

### 1.6 Race Condition en Constructor de Database

**Problema**: El constructor de `Database` llama a `init()` que ejecuta operaciones async (callbacks de sqlite3), pero el constructor retorna inmediatamente. Si se invoca un método de la DB antes de que el schema esté listo, falla.

**Solución**: Convertir la inicialización a una promesa y exponer un método `ready()` o usar un patrón de inicialización lazy que espere la promesa antes de ejecutar queries.

**Archivos afectados**: `src/database.js`, `src/mcp-server.js`, `src/web-server.js`

---

## Fase 2 — Seguridad y Estabilidad

> **Prioridad**: IMPORTANTE  
> **Impacto**: Protección contra vulnerabilidades y mejora de estabilidad en producción

### 2.1 Habilitar WAL Mode en SQLite

**Problema**: Sin WAL (Write-Ahead Logging), las lecturas concurrentes se bloquean mutuamente. Dado que MCP server y web server pueden acceder al mismo archivo `.db` simultáneamente, se producen errores `SQLITE_BUSY`.

**Solución**: Ejecutar `PRAGMA journal_mode = WAL` durante la inicialización de la base de datos.

**Archivos afectados**: `src/database.js`

---

### 2.2 Restringir CORS

**Problema**: `cors()` sin opciones permite requests desde cualquier origen, exponiendo la API a ataques CSRF desde sitios maliciosos.

**Solución**: Configurar CORS para permitir solo orígenes locales conocidos (`localhost` en los puertos utilizados). Hacer el origen configurable.

**Archivos afectados**: `src/web-server.js`

---

### 2.3 Agregar Headers de Seguridad con Helmet

**Problema**: Faltan headers HTTP de seguridad estándar (X-Content-Type-Options, X-Frame-Options, CSP, etc.).

**Solución**: Instalar y configurar `helmet` como middleware de Express.

**Archivos afectados**: `package.json`, `src/web-server.js`

---

### 2.4 Agregar Logging de Requests

**Problema**: No hay registro de requests HTTP, lo que dificulta el debugging y la auditoría de la API.

**Solución**: Instalar y configurar `morgan` en modo `dev` para desarrollo y `combined` para producción.

**Archivos afectados**: `package.json`, `src/web-server.js`

---

### 2.5 Validación de Inputs en MCP Server

**Problema**: Los argumentos de las herramientas MCP no se validan antes de procesarse. Valores inesperados podrían causar errores no manejados.

**Solución**: Agregar validación de tipos y rangos para todos los parámetros de entrada en cada tool handler. Verificar que `status` y `priority` contengan valores válidos del enum.

**Archivos afectados**: `src/mcp-server.js`

---

### 2.6 Health Check Endpoint

**Problema**: No hay forma de verificar programáticamente que el servidor web está funcionando correctamente.

**Solución**: Agregar endpoint `GET /api/health` que retorne estado del servidor y conectividad a la base de datos.

**Archivos afectados**: `src/web-server.js`

---

## Fase 3 — Mejoras de Frontend y UX

> **Prioridad**: MODERADA  
> **Impacto**: Mejor experiencia de usuario y rendimiento del frontend

### 3.1 Debounce en Filtro de Búsqueda

**Problema**: Cada keystroke en el campo de búsqueda dispara una request HTTP al backend, generando carga innecesaria y posibles condiciones de carrera en las respuestas.

**Solución**: Implementar un debounce de 300ms en el evento `input` del filtro de búsqueda.

**Archivos afectados**: `public/app.js`

---

### 3.2 Accesibilidad Básica (a11y)

**Problema**: Los modales no gestionan el focus, faltan `aria-labels` en elementos interactivos, y no hay soporte de teclado para cerrar modales (Escape).

**Solución**:
- Agregar `aria-label` y `role="dialog"` a los modales
- Trap de focus dentro de modales abiertos
- Cerrar modales con tecla Escape
- Agregar `aria-live="polite"` al contenedor de toasts

**Archivos afectados**: `public/index.html`, `public/app.js`

---

### 3.3 Posicionamiento Inteligente del Menú de Estado

**Problema**: El menú contextual de cambio de estado se posiciona con coordenadas fijas del click, sin verificar si cabe en el viewport. En elementos cercanos al borde inferior/derecho, el menú se corta.

**Solución**: Verificar las dimensiones del viewport y ajustar la posición del menú para que siempre sea visible.

**Archivos afectados**: `public/app.js`

---

### 3.4 Barra de Progreso Visual en Suites

**Problema**: Las estadísticas de cada suite en el sidebar son solo numéricas. Un indicador visual haría más inmediato el estado del progreso.

**Solución**: Agregar una barra de progreso coloreada (verde/rojo/gris) debajo de cada suite en el sidebar.

**Archivos afectados**: `public/app.js`, `public/style.css`

---

### 3.5 Confirmación de Navegación con Cambios Pendientes

**Problema**: Si el usuario está editando un formulario y navega a otra suite o recarga la página, pierde los cambios sin aviso.

**Solución**: Interceptar `beforeunload` y cambios de suite cuando hay formularios con datos sin guardar.

**Archivos afectados**: `public/app.js`

---

## Fase 4 — Mejoras de Arquitectura y Configuración

> **Prioridad**: DESEABLE  
> **Impacto**: Mantenibilidad y flexibilidad del proyecto a largo plazo

### 4.1 Configuración Centralizada con .env

**Problema**: Puerto, path de la DB e incluso orígenes CORS están dispersos y hardcodeados en diferentes archivos.

**Solución**:
- Instalar `dotenv`
- Crear archivo `.env.example` con todas las variables
- Crear `src/config.js` que centralice toda la configuración
- Actualizar servidores para usar la configuración centralizada

**Archivos afectados**: `package.json`, `.env.example`, `src/config.js`, `src/web-server.js`, `src/mcp-server.js`, `src/database.js`

---

### 4.2 Sistema de Migraciones de Base de Datos

**Problema**: `schema.sql` se ejecuta completo en cada inicio. No hay forma de agregar columnas o tablas nuevas a bases de datos existentes sin perder datos.

**Solución**: Implementar un sistema simple de migraciones basado en una tabla `migrations` que registre qué scripts ya se ejecutaron. Las migraciones serán archivos SQL numerados (`001_initial.sql`, `002_add_column.sql`).

**Archivos afectados**: `src/database.js`, `src/migrations/` (nuevo directorio)

---

### 4.3 .gitignore

**Problema**: No existe archivo `.gitignore`. Archivos generados como `node_modules/`, `tests.db` y `.env` podrían subirse al repositorio.

**Solución**: Crear `.gitignore` con las exclusiones adecuadas.

**Archivos afectados**: `.gitignore` (nuevo)

---

### 4.4 Paginación en Endpoints de Lista

**Problema**: `GET /api/cases` y `GET /api/suites` devuelven todos los registros. Con volúmenes grandes, esto degrada rendimiento y usabilidad.

**Solución**: Agregar parámetros `page` y `limit` con valores por defecto razonables (ej: 50 por página). Retornar metadata de paginación (`total`, `page`, `pages`).

**Archivos afectados**: `src/database.js`, `src/web-server.js`, `public/app.js`

---

## Fase 5 — Nuevas Funcionalidades

> **Prioridad**: FUTURA  
> **Impacto**: Enriquecimiento funcional del producto

### 5.1 Exportar/Importar Suites (JSON)

**Descripción**: Permitir exportar una suite completa (con todos sus test cases) a un archivo JSON, y reimportarla. Útil para backup, compartir entre equipos, o migración.

**Implementación**:
- Nuevo tool MCP: `export_test_suite`, `import_test_suite`
- Nuevos endpoints: `GET /api/suites/:id/export`, `POST /api/suites/import`
- Botón de exportar/importar en el frontend

**Archivos afectados**: `src/mcp-server.js`, `src/database.js`, `src/web-server.js`, `public/app.js`, `public/index.html`

---

### 5.2 Duplicar Test Suite

**Descripción**: Clonar una suite completa incluyendo todos sus test cases (con status reseteado a `pending`). Útil para crear suites de regresión o nuevas iteraciones.

**Implementación**:
- Nuevo tool MCP: `duplicate_test_suite`
- Nuevo endpoint: `POST /api/suites/:id/duplicate`
- Botón "Duplicar" en el frontend

**Archivos afectados**: `src/mcp-server.js`, `src/database.js`, `src/web-server.js`, `public/app.js`

---

### 5.3 Actualización Masiva de Estado

**Descripción**: Marcar múltiples test cases con el mismo estado de una vez. Por ejemplo, marcar todos los `pending` como `skipped`, o todos los de una categoría como `passed`.

**Implementación**:
- Nuevo tool MCP: `bulk_update_test_cases`
- Nuevo endpoint: `PUT /api/cases/bulk`
- Checkboxes de selección múltiple en el frontend con acciones masivas

**Archivos afectados**: `src/mcp-server.js`, `src/database.js`, `src/web-server.js`, `public/app.js`, `public/index.html`, `public/style.css`

---

### 5.4 Historial de Ejecución

**Descripción**: Registrar cada cambio de estado de un test case con timestamp y notas. Permite ver cuántas veces falló un caso, cuándo pasó por última vez, y el historial completo.

**Implementación**:
- Nueva tabla: `test_case_history` (case_id, old_status, new_status, notes, timestamp)
- Nuevo tool MCP: `get_test_case_history`
- Nuevo endpoint: `GET /api/cases/:id/history`
- Panel de historial expandible en cada test case del frontend

**Archivos afectados**: `src/schema.sql` (o migración), `src/database.js`, `src/mcp-server.js`, `src/web-server.js`, `public/app.js`, `public/index.html`, `public/style.css`

---

### 5.5 MCP Resources y Prompts

**Descripción**: Agregar capacidades adicionales del protocolo MCP:
- **Resources**: Exponer suites como recursos legibles por LLMs (ej: `testing://suites/1/summary`)
- **Prompts**: Predefinir prompts útiles como "Analyze test failures", "Generate regression suite", "Summarize test progress"

**Implementación**:
- Agregar capacidades `resources` y `prompts` en la respuesta de `initialize`
- Implementar handlers para `resources/list`, `resources/read`, `prompts/list`, `prompts/get`

**Archivos afectados**: `src/mcp-server.js`

---

## Cronograma Sugerido

| Fase | Descripción | Tareas | Complejidad |
|------|-------------|--------|-------------|
| **1** | Correcciones Críticas | 6 tareas | Baja-Media |
| **2** | Seguridad y Estabilidad | 6 tareas | Baja-Media |
| **3** | Frontend y UX | 5 tareas | Media |
| **4** | Arquitectura y Configuración | 4 tareas | Media |
| **5** | Nuevas Funcionalidades | 5 tareas | Media-Alta |

> **Recomendación**: Ejecutar las fases 1 y 2 juntas como primera iteración, ya que corrigen problemas reales que afectan la fiabilidad del sistema. Las fases 3-5 pueden implementarse incrementalmente según necesidad.

---

## Notas de Implementación

- Cada fase se implementará con commits atómicos por tarea para facilitar revisión y rollback
- Se mantendrá compatibilidad con la base de datos existente (no se pierden datos)
- Los cambios en el MCP server preservarán la interfaz de herramientas actual (no breaking changes para clientes)
- El frontend seguirá siendo vanilla HTML/CSS/JS sin frameworks adicionales
