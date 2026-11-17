ALTER TABLE routines ADD COLUMN version bigint NOT NULL DEFAULT 1;

CREATE TABLE sleep_records (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, workspace_child_id uuid NOT NULL, child_id uuid NOT NULL,
 started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL,
 created_by uuid NOT NULL, version bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 FOREIGN KEY(workspace_child_id,workspace_id,child_id) REFERENCES workspace_children(id,workspace_id,child_id),
 FOREIGN KEY(created_by,workspace_id) REFERENCES memberships(id,workspace_id),
 CHECK(ended_at>started_at AND ended_at<=started_at+interval '7 days')
);
CREATE INDEX idx_sleep_records_child ON sleep_records(workspace_id,child_id,started_at DESC,id DESC) WHERE deleted_at IS NULL;

