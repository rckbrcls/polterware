-- Commits shown on a card: a stored link keeps the commit's subject, time, and
-- GitHub URL, so the card reads them without a checkout.

ALTER TABLE work_commit_links ADD COLUMN subject TEXT NOT NULL DEFAULT '';
ALTER TABLE work_commit_links ADD COLUMN url TEXT NOT NULL DEFAULT '';
ALTER TABLE work_commit_links ADD COLUMN committed_at TEXT NOT NULL DEFAULT '';

-- Drift is retired: its AgentRun steps go with it.
DELETE FROM agent_run_steps WHERE kind = 'drift';
