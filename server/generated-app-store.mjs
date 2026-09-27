import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { appError, validateAppPackage, validatePrompt } from './app-generator.mjs';

export function createGeneratedAppStore({ filename = ':memory:', maxAppsPerWorkspace = 30 } = {}) {
  if (!Number.isSafeInteger(maxAppsPerWorkspace) || maxAppsPerWorkspace < 1) throw new RangeError('Invalid app limit');
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS generated_apps (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL,
      prompt TEXT NOT NULL, package_json TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS generated_apps_workspace ON generated_apps(workspace_id, created_at);`);
  const read = db.prepare('SELECT * FROM generated_apps WHERE id=? AND workspace_id=?');
  const list = db.prepare('SELECT id,title,prompt,created_at FROM generated_apps WHERE workspace_id=? ORDER BY created_at DESC,rowid DESC');
  const count = db.prepare('SELECT COUNT(*) AS n FROM generated_apps WHERE workspace_id=?');
  const insert = db.prepare('INSERT INTO generated_apps(id,workspace_id,title,prompt,package_json,created_at) VALUES(?,?,?,?,?,?)');
  const metadata = row => ({ id: row.id, title: row.title, prompt: row.prompt, createdAt: new Date(row.created_at).toISOString() });
  function get(workspaceId, id) {
    const row = read.get(id, workspaceId);
    return row ? { ...metadata(row), ...JSON.parse(row.package_json) } : null;
  }
  return {
    list(workspaceId) { return list.all(workspaceId).map(metadata); },
    get,
    save(workspaceId, prompt, value) {
      if (typeof workspaceId !== 'string' || !workspaceId) throw appError(401, 'APP_WORKSPACE_REQUIRED', '请先打开工作区。');
      prompt = validatePrompt(prompt);
      const app = validateAppPackage(value);
      db.exec('BEGIN IMMEDIATE');
      try {
        if (count.get(workspaceId).n >= maxAppsPerWorkspace) throw appError(409, 'APP_LIMIT_REACHED', '工作区已达到保存应用上限。');
        const id = 'gen-' + randomUUID();
        insert.run(id, workspaceId, app.title, prompt, JSON.stringify(app), Date.now());
        db.exec('COMMIT');
        return get(workspaceId, id);
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}
