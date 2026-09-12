-- Rename legacy Twilio-named agent columns to the SignalWire names used by the calls module.
-- Safe to run more than once on PostgreSQL.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'twilio_identity'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'signalwire_identity'
  ) THEN
    ALTER TABLE agents RENAME COLUMN twilio_identity TO signalwire_identity;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'twilio_phone_number'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'signalwire_phone_number'
  ) THEN
    ALTER TABLE agents RENAME COLUMN twilio_phone_number TO signalwire_phone_number;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'twilio_phone_sid'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'signalwire_phone_sid'
  ) THEN
    ALTER TABLE agents RENAME COLUMN twilio_phone_sid TO signalwire_phone_sid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'twilio_phone_area_code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'signalwire_phone_area_code'
  ) THEN
    ALTER TABLE agents RENAME COLUMN twilio_phone_area_code TO signalwire_phone_area_code;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'twilio_phone_purchased_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'signalwire_phone_purchased_at'
  ) THEN
    ALTER TABLE agents RENAME COLUMN twilio_phone_purchased_at TO signalwire_phone_purchased_at;
  END IF;
END $$;

ALTER TABLE agents ADD COLUMN IF NOT EXISTS signalwire_identity TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS signalwire_phone_number TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS signalwire_phone_sid TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS signalwire_phone_area_code TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS signalwire_phone_purchased_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_signalwire_identity_unique
  ON agents(signalwire_identity)
  WHERE signalwire_identity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agents_signalwire_phone_number
  ON agents(signalwire_phone_number);
