async function hasColumn(db, tableName, columnName) {
  const columns = await db.all(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
}

async function ensureSchemaVersionTable(db) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    )
  `);

  const row = await db.get('SELECT version FROM schema_version LIMIT 1');
  if (!row) {
    await db.run('INSERT INTO schema_version (version) VALUES (0)');
    return 0;
  }

  return row.version;
}

const migrations = [
  async (db) => {
    if (!(await hasColumn(db, 'tasks', 'title'))) {
      await db.run('ALTER TABLE tasks ADD COLUMN title TEXT');
    }

    if (!(await hasColumn(db, 'tasks', 'tags'))) {
      await db.run('ALTER TABLE tasks ADD COLUMN tags TEXT');
    }

    if (!(await hasColumn(db, 'tasks', 'completed_at'))) {
      await db.run('ALTER TABLE tasks ADD COLUMN completed_at DATETIME');
    }

    await db.run('UPDATE tasks SET title = description WHERE title IS NULL');

    await db.run(`
      CREATE TABLE IF NOT EXISTS dependencies (
        task_id INTEGER NOT NULL,
        depends_on_task_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (task_id, depends_on_task_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    await db.run('CREATE INDEX IF NOT EXISTS idx_history_task ON history(task_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks(tags)');
  }
];

export async function runMigrations(db) {
  let currentVersion = await ensureSchemaVersionTable(db);

  while (currentVersion < migrations.length) {
    const nextVersion = currentVersion + 1;
    await migrations[currentVersion](db);
    await db.run('UPDATE schema_version SET version = ?', [nextVersion]);
    currentVersion = nextVersion;
  }
}

export default runMigrations;
