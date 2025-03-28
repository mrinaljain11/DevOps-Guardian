-- Create transaction_type enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
        CREATE TYPE transaction_type AS ENUM ('api', 'content', 'form', 'navigation');
    END IF;
END$$;

-- Add check_interval column to synthetic_transactions if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'synthetic_transactions' 
        AND column_name = 'check_interval'
    ) THEN
        ALTER TABLE synthetic_transactions ADD COLUMN check_interval integer NOT NULL DEFAULT 300;
    END IF;
END$$;