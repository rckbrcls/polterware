-- Deploy links for Atlas nodes: one provider resource per environment.
-- provider is a catalog id. Credentials and tokens are never stored.
CREATE TABLE IF NOT EXISTS node_deployments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES atlas_nodes(id) ON DELETE CASCADE,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN (
    'github', 'gitlab', 'aws', 'google-cloud', 'azure', 'vercel', 'supabase', 'terraform', 'docker'
  )),
  resource TEXT NOT NULL CHECK (resource <> ''),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (node_id, environment_id)
);
CREATE INDEX IF NOT EXISTS idx_node_deployments_project ON node_deployments(project_id);
CREATE INDEX IF NOT EXISTS idx_node_deployments_environment ON node_deployments(environment_id);
