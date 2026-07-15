CREATE INDEX idx_activity_actor_type_created
    ON activity(actor_id, type, created_at DESC);
