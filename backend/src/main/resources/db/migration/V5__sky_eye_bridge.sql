CREATE TABLE sky_eye_status (
 device_id uuid PRIMARY KEY REFERENCES devices(id), observed_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(), body jsonb NOT NULL
);
CREATE TABLE sky_eye_events (
 device_id uuid NOT NULL REFERENCES devices(id), event_id varchar(128) NOT NULL,
 observed_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 body jsonb NOT NULL, PRIMARY KEY(device_id,event_id)
);
CREATE INDEX idx_sky_eye_events_time ON sky_eye_events(device_id,observed_at DESC);
ALTER TABLE sky_eye_events ADD CONSTRAINT camera_event_kinds CHECK (body->>'kind' IN ('risk_started','risk_ended','risk_interrupted','status_changed','posture_changed'));
ALTER TABLE sky_eye_status ADD CONSTRAINT camera_status_only CHECK (NOT (body ?| ARRAY['audio','personalization']));
