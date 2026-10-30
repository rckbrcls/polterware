-- Repositories belong to components, not to the project. A project is a name
-- and its environments; a repository is a GitHub-level identity (remote, such
-- as github.com/owner/repo) plus this machine's clone (local_path), and Structure
-- components link one by name with a folder inside it. The project folder
-- becomes a repository named "main".

CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  remote TEXT NOT NULL DEFAULT '',
  local_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_repositories_name ON repositories(project_id, name);

INSERT INTO repositories(id, project_id, name, remote, local_path, created_at, updated_at)
  SELECT id, project_id, name, '', path, created_at, updated_at FROM project_repos;

INSERT OR IGNORE INTO repositories(id, project_id, name, remote, local_path, created_at, updated_at)
  SELECT 'repo-main-' || id, id, 'main', '', root_path, created_at, updated_at
  FROM projects WHERE root_path <> '';

-- What named the project folder (an empty repo) now names "main".
UPDATE structure_nodes SET repo = 'main'
  WHERE repo = '' AND folder <> ''
  AND project_id IN (SELECT project_id FROM repositories WHERE id = 'repo-main-' || project_id);
UPDATE work_tasks SET repo = 'main'
  WHERE repo = '' AND card_id IN (SELECT c.id FROM work_cards c JOIN repositories r ON r.project_id = c.project_id AND r.id = 'repo-main-' || c.project_id);
UPDATE work_commit_links SET repo = 'main'
  WHERE repo = '' AND project_id IN (SELECT project_id FROM repositories WHERE id = 'repo-main-' || project_id);

DROP TABLE project_repos;
ALTER TABLE projects DROP COLUMN root_path;
