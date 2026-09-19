-- Migration: Demo Number Pool
-- Created at: 2024-03-05

CREATE TABLE IF NOT EXISTS demo_number_pool (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(50) UNIQUE NOT NULL,
    provider VARCHAR(50) DEFAULT 'signalwire',
    provider_sid VARCHAR(255),
    status VARCHAR(20) DEFAULT 'available', -- 'available' or 'assigned'
    assigned_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup of available numbers
CREATE INDEX IF NOT EXISTS idx_demo_number_pool_status ON demo_number_pool(status);
CREATE INDEX IF NOT EXISTS idx_demo_number_pool_expires ON demo_number_pool(expires_at);
CREATE INDEX IF NOT EXISTS idx_demo_number_pool_tenant ON demo_number_pool(assigned_tenant_id);
