-- Backfill tenant_id for all existing records
-- Get the oldest tenant and assign it to all NULL tenant_id records

UPDATE invoices
SET tenant_id = (SELECT tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE customers
SET tenant_id = (SELECT tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE payments
SET tenant_id = (SELECT tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE disputes
SET tenant_id = (SELECT tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1)
WHERE tenant_id IS NULL;