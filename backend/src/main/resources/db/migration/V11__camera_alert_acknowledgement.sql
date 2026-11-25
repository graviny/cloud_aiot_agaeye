-- Caregiver acknowledgement and the Pi-reported end of a risk, used for the second alert.
ALTER TABLE sky_eye_alerts
    ADD COLUMN acknowledged_at timestamptz,
    ADD COLUMN acknowledged_by uuid REFERENCES memberships(id) ON DELETE SET NULL,
    ADD COLUMN ended_at timestamptz;
