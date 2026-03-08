-- 1. Create the `transfers` table
CREATE TABLE IF NOT EXISTS public.transfers (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    mimetype TEXT,
    size BIGINT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- 2. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_transfers_code ON public.transfers(code);

-- 3. Enable RLS on the table
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

-- 4. Table Policies (Allow anonymous access)
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.transfers;
CREATE POLICY "Allow anonymous insert" ON public.transfers 
FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous select" ON public.transfers;
CREATE POLICY "Allow anonymous select" ON public.transfers 
FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anonymous delete" ON public.transfers;
CREATE POLICY "Allow anonymous delete" ON public.transfers 
FOR DELETE TO anon USING (true);

-- 5. Storage Policies (Standard CREATE POLICY syntax)
-- These allow the frontend to upload/download/delete files in the 'transfers' bucket.

-- Enable RLS on Storage (Required)
-- Note: 'transfers' bucket must already exist (run init_storage.js first)

-- Allow anyone to upload files to the 'transfers' bucket
DROP POLICY IF EXISTS "Allow anonymous uploads" ON storage.objects;
CREATE POLICY "Allow anonymous uploads" ON storage.objects 
FOR INSERT TO anon WITH CHECK (bucket_id = 'transfers');

-- Allow anyone to download files from the 'transfers' bucket
DROP POLICY IF EXISTS "Allow anonymous select" ON storage.objects;
CREATE POLICY "Allow anonymous select" ON storage.objects 
FOR SELECT TO anon USING (bucket_id = 'transfers');

-- Allow anyone to delete files from the 'transfers' bucket
DROP POLICY IF EXISTS "Allow anonymous delete" ON storage.objects;
CREATE POLICY "Allow anonymous delete" ON storage.objects 
FOR DELETE TO anon USING (bucket_id = 'transfers');
