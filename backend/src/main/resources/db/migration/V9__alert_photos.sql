CREATE TABLE sky_eye_alerts (
    id uuid PRIMARY KEY,
    device_id uuid NOT NULL REFERENCES devices(id),
    field text NOT NULL CHECK (field IN ('posture','face','edge','observation')),
    level text NOT NULL CHECK (level IN ('unknown','caution','immediate')),
    observed_at timestamptz NOT NULL,
    captured_at timestamptz,
    jpeg bytea,
    CHECK ((jpeg IS NULL) = (captured_at IS NULL)),
    CHECK (octet_length(jpeg) BETWEEN 4 AND 524288)
);
CREATE INDEX sky_eye_alerts_device_time ON sky_eye_alerts(device_id, observed_at DESC, id);

CREATE TABLE sky_eye_notice_state (
    device_id uuid NOT NULL REFERENCES devices(id),
    field text NOT NULL,
    highest integer NOT NULL,
    stable_since timestamptz,
    unknown_since timestamptz,
    last_seen timestamptz NOT NULL,
    PRIMARY KEY (device_id, field)
);
