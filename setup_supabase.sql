-- 1. Create the `transfers` table
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

CREATE TABLE IF NOT EXISTS public.transfers (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,      -- 4-digit code (e.g., GHJK)
    filename TEXT NOT NULL,         -- Original filename
    mimetype TEXT,                  -- File type
    size BIGINT NOT NULL,           -- File size in bytes
    file_path TEXT NOT NULL,        -- Path in Storage (e.g., transfers/CODE-TIMESTAMP.ext)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL -- Expiration timestamp
);

-- 2. Create index for fast lookups by code
CREATE INDEX IF NOT EXISTS idx_transfers_code ON public.transfers(code);

-- 3. (Optional) Enable Row Level Security (RLS)
-- If you want to restrict access, but for a simple "no-login" dropzone,
-- you can leave it disabled or add specific policies.
-- ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
