# MCP Testing Tracker

Un servidor MCP (Model Context Protocol) para gestionar checklists de procesos de testing con persistencia en SQLite y una interfaz web simple para visualización y edición.

## 🚀 Características

- **Servidor MCP**: Expone herramientas de testing via protocolo stdio
- **Base de datos SQLite**: Persistencia de datos ligera y confiable
- **API REST**: Endpoints para gestión completa de suites y casos de prueba
- **Interfaz Web**: UI responsive con HTML/CSS/JavaScript vanilla
- **Gestión completa**: Crear, editar, filtrar y hacer seguimiento de casos de prueba
- **Estados de prueba**: pending, passed, failed, blocked, skipped
- **Prioridades**: low, medium, high, critical
- **Categorización**: Organiza casos por categorías personalizadas
- **Búsqueda y filtros**: Encuentra casos específicos rápidamente
- **Estadísticas en tiempo real**: Seguimiento del progreso de testing

## 📁 Estructura del Proyecto

```
mcp-testing-server/
├── package.json              # Configuración del proyecto y dependencias
├── README.md                  # Documentación
├── src/
│   ├── mcp-server.js         # Servidor MCP principal
│   ├── database.js           # Gestión de SQLite y operaciones CRUD
│   ├── schema.sql            # Schema de base de datos
│   └── web-server.js         # Servidor HTTP con Express.js
├── public/
│   ├── index.html            # Interfaz de usuario principal
│   ├── style.css             # Estilos CSS
│   └── app.js                # Lógica JavaScript del frontend
└── tests.db                  # Base de datos SQLite (generada automáticamente)
```

## 🛠️ Instalación

1. **Clona o descarga el proyecto**:
   ```bash
   git clone <repository-url>
   cd mcp-testing-server
   ```

2. **Instala las dependencias**:
   ```bash
   npm install
   ```

3. **La base de datos se crea automáticamente** al iniciar cualquiera de los servidores.

## 🖥️ Uso del Servidor Web

### Iniciar el servidor web:
```bash
# Puerto por defecto (3000)
npm run start:web

# Puerto específico usando argumentos
node src/web-server.js 3001

# Puerto específico usando variable de entorno
PORT=8080 npm run start:web

# Scripts predefinidos para puertos comunes
npm run start:web:3001
npm run start:web:8080
```

### Acceder a la interfaz:
Abre tu navegador en: `http://localhost:3000` (o el puerto que hayas configurado)

### Funcionalidades de la UI:

#### **Sidebar - Gestión de Suites**
- Lista todas las suites de testing con estadísticas
- Botón "Nueva Suite" para crear suites
- Click en una suite para seleccionarla y ver sus casos

#### **Panel Principal**
- **Header**: Nombre de la suite seleccionada y resumen estadístico
- **Filtros**: Por estado, prioridad, categoría y búsqueda de texto
- **Lista de casos**: Tabla con todos los casos de la suite seleccionada
- **Acciones**: Crear, editar y eliminar casos y suites

#### **Gestión de Casos de Prueba**
- **Estados**: Click en el badge de estado para cambiar rápidamente
- **Edición**: Botón "Editar" para modificar descripción, prioridad, categoría y notas
- **Eliminación**: Botón "Eliminar" con confirmación

## 🤖 Uso del Servidor MCP

### Configuración en Claude Desktop

1. **Edita tu archivo de configuración** (`claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "testing-tracker": {
         "command": "node",
         "args": ["ruta/completa/al/proyecto/src/mcp-server.js"],
         "env": {}
       }
     }
   }
   ```

2. **Reinicia Claude Desktop** para cargar la configuración.

### Herramientas MCP Disponibles

#### **create_test_suite**
Crea una nueva suite de testing.
```
Parámetros:
- name (obligatorio): Nombre de la suite
- project (opcional): Nombre del proyecto
- description (opcional): Descripción de la suite

Ejemplo: "Crea una suite llamada 'Login Tests' para el proyecto 'WebApp'"
```

#### **list_test_suites**
Lista todas las suites con estadísticas.
```
Parámetros:
- project (opcional): Filtrar por nombre de proyecto

Ejemplo: "Muéstrame todas las suites de testing"
```

#### **add_test_case**
Agrega un nuevo caso de prueba a una suite.
```
Parámetros:
- suite_id (obligatorio): ID de la suite
- description (obligatorio): Descripción del caso
- priority (opcional): low, medium, high, critical
- category (opcional): Categoría del caso

Ejemplo: "Agrega un caso de prueba 'Verificar login con credenciales válidas' 
         con prioridad high a la suite 1"
```

#### **update_test_case**
Actualiza un caso de prueba existente.
```
Parámetros:
- id (obligatorio): ID del caso
- status (opcional): pending, passed, failed, blocked, skipped
- notes (opcional): Notas adicionales
- priority (opcional): Cambiar prioridad

Ejemplo: "Marca el caso 5 como passed con nota 'Funciona correctamente'"
```

#### **get_test_cases**
Obtiene casos de prueba con filtros.
```
Parámetros:
- suite_id (opcional): Filtrar por suite
- status (opcional): Filtrar por estado
- priority (opcional): Filtrar por prioridad
- category (opcional): Filtrar por categoría
- search (opcional): Buscar en descripción y notas

Ejemplo: "Muéstrame todos los casos failed de la suite 1"
```

#### **get_test_summary**
Obtiene estadísticas de una suite.
```
Parámetros:
- suite_id (obligatorio): ID de la suite

Ejemplo: "Dame un resumen de la suite 1"
```

#### **delete_test_case**
Elimina un caso de prueba.
```
Parámetros:
- id (obligatorio): ID del caso a eliminar

Ejemplo: "Elimina el caso de prueba 10"
```

#### **delete_test_suite**
Elimina una suite y todos sus casos.
```
Parámetros:
- id (obligatorio): ID de la suite a eliminar

Ejemplo: "Elimina la suite 2 y todos sus casos"
```

### Ejemplos de Prompts para Claude

```
"Crea una suite llamada 'API Authentication Tests' para el proyecto 'Backend API'"

"Agrega 3 casos de prueba a la suite de autenticación:
1. Login con credenciales válidas (prioridad high)
2. Login con password incorrecta (prioridad medium) 
3. Login con usuario inexistente (prioridad medium)"

"Marca todos los casos de la suite 1 que están pending como passed"

"Muéstrame un resumen completo de todas mis suites de testing"

"¿Cuántos casos failed tengo en total?"

"Crea casos de prueba para testing de una función de registro de usuarios"
```

## 🔧 Scripts Disponibles

```bash
# Iniciar solo el servidor MCP
npm run start:mcp

# Iniciar solo el servidor web (puerto 3000 por defecto)
npm run start:web

# Iniciar servidor web en puerto específico
npm run start:web:3001
npm run start:web:8080

# Iniciar ambos servidores simultáneamente (puerto 3000)
npm run dev

# Iniciar ambos servidores en puerto alternativo
npm run dev:3001

# Configurar puerto manualmente
PORT=8080 npm run start:web
node src/web-server.js 4000
```

## 🗃️ Base de Datos

### Schema
La base de datos SQLite se crea automáticamente con el siguiente schema:

#### **test_suites**
- `id`: Clave primaria autoincremental
- `name`: Nombre de la suite (obligatorio)
- `project`: Nombre del proyecto (opcional)
- `description`: Descripción de la suite (opcional)
- `created_at`: Timestamp de creación
- `updated_at`: Timestamp de última actualización

#### **test_cases**
- `id`: Clave primaria autoincremental
- `suite_id`: Referencia a test_suites (FK)
- `description`: Descripción del caso (obligatorio)
- `priority`: low|medium|high|critical (default: medium)
- `status`: pending|passed|failed|blocked|skipped (default: pending)
- `category`: Categoría personalizada (opcional)
- `notes`: Notas adicionales (opcional)
- `created_at`: Timestamp de creación
- `updated_at`: Timestamp de última actualización

### Índices
- `idx_test_cases_suite`: Por suite_id
- `idx_test_cases_status`: Por status
- `idx_test_cases_priority`: Por priority
- `idx_test_cases_category`: Por category

## 🌐 API REST

### Endpoints

#### **Suites**
- `GET /api/suites` - Listar suites
- `POST /api/suites` - Crear suite
- `DELETE /api/suites/:id` - Eliminar suite

#### **Casos de Prueba**
- `GET /api/cases` - Listar casos (con filtros query params)
- `POST /api/cases` - Crear caso
- `PUT /api/cases/:id` - Actualizar caso
- `DELETE /api/cases/:id` - Eliminar caso

#### **Estadísticas**
- `GET /api/summary/:suite_id` - Obtener resumen de suite

### Filtros disponibles en `/api/cases`:
- `suite_id`: Filtrar por suite
- `status`: Filtrar por estado
- `priority`: Filtrar por prioridad
- `category`: Filtrar por categoría
- `search`: Buscar en descripción y notas

## 🎨 Interfaz de Usuario

### Características del UI:
- **Diseño responsive**: Funciona en desktop y móvil
- **Tema moderno**: Colores y tipografía profesional
- **Indicadores visuales**: Badges de estado y prioridad coloreados
- **Interacción intuitiva**: Click para cambiar estados, modales para edición
- **Filtros en tiempo real**: Búsqueda y filtrado instantáneo
- **Notificaciones**: Toast messages para feedback del usuario
- **Confirmaciones**: Diálogos de confirmación para acciones destructivas

### Paleta de Colores:
- **Estados**: Verde (passed), Rojo (failed), Gris (pending), Naranja (blocked), Azul (skipped)
- **Prioridades**: Rojo (critical), Naranja (high), Amarillo (medium), Verde (low)

## 🚨 Manejo de Errores

- **Frontend**: Mensajes de error user-friendly con toast notifications
- **Backend**: Respuestas HTTP apropiadas con mensajes descriptivos
- **Base de datos**: Transacciones para mantener consistencia
- **MCP**: Respuestas de error estructuradas según el protocolo

## 🔒 Seguridad

- **SQL Injection**: Uso de prepared statements
- **Input validation**: Validación en frontend y backend
- **CORS**: Configurado para requests locales
- **Sanitización**: Escape de HTML en el frontend

## 📈 Performance

- **Índices de base de datos**: Para consultas frecuentes
- **Paginación**: Preparado para grandes volúmenes de datos
- **Caching**: Estadísticas calculadas eficientemente
- **Lazy loading**: Carga de datos bajo demanda

## 🛠️ Desarrollo

### Estructura del código:
- **Separación de concerns**: Database, MCP server, web server separados
- **Código modular**: Clases y funciones bien definidas
- **Comentarios**: Documentación inline donde es necesario
- **Error handling**: Try-catch consistente
- **ES6 modules**: Imports/exports modernos

### Agregar nuevas características:
1. **Nuevos campos**: Modificar schema.sql y actualizar todas las capas
2. **Nuevos filtros**: Agregar a database.js, web-server.js y frontend
3. **Nuevas herramientas MCP**: Implementar en mcp-server.js
4. **UI mejorada**: Modificar HTML/CSS/JS en la carpeta public

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-caracteristica`)
3. Commit tus cambios (`git commit -am 'Agrega nueva característica'`)
4. Push a la rama (`git push origin feature/nueva-caracteristica`)
5. Abre un Pull Request

## 📄 Licencia

MIT License - ver archivo LICENSE para más detalles.

## 📞 Soporte

Para preguntas o problemas:
1. Revisa la documentación
2. Verifica los logs del servidor
3. Abre un issue en el repositorio

---

¡Disfruta gestionando tus procesos de testing con MCP Testing Tracker! 🎯