CREATE TABLE sky_eye_latest_captures (
    device_id uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    captured_at timestamptz NOT NULL,
    state text NOT NULL CHECK (state IN ('normal','caution','risk','unavailable')),
    posture text CHECK (posture IN ('supine','side','prone')),
    airway text CHECK (airway IN ('airway_visible','airway_covered')),
    jpeg bytea NOT NULL CHECK (octet_length(jpeg) BETWEEN 4 AND 524288),
    CHECK (state <> 'unavailable' OR (posture IS NULL AND airway IS NULL))
);
