require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase (Secure Server-Side)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const app = express();

// Trust Proxy for Vercel
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // For development simplicity, or customize for production
}));
app.use(cors());
app.use(compression());
app.use(express.json());

const CODE_REGEX = /^[A-Z2-9]{4}$/;

// --- API ROUTES ---

// GET /api/config (Public keys for Frontend)
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
});

// POST /api/upload-metadata (Register transfer after client upload)
app.post('/api/upload-metadata', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase not initialized' });
    const { code, filename, mimetype, size, file_path } = req.body;

    if (!code || !filename || !file_path) {
        return res.status(400).json({ error: 'Missing required metadata' });
    }

    const ttlSeconds = 600;
    const expiresAt = new Date(Date.now() + (ttlSeconds * 1000)).toISOString();

    try {
        const { error: dbError } = await supabase
            .from('transfers')
            .insert({
                code,
                filename,
                mimetype,
                size,
                expires_at: expiresAt,
                file_path
            });

        if (dbError) throw dbError;

        res.json({ success: true, code, expires: ttlSeconds });
    } catch (error) {
        console.error('[DATABASE ERROR]', error);
        res.status(500).json({ error: 'Failed to register transfer: ' + error.message });
    }
});

// GET /api/status/:code
app.get('/api/status/:code', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase not initialized' });
    const code = req.params.code.toUpperCase();
    if (!CODE_REGEX.test(code)) return res.status(400).json({ error: 'Invalid code format' });

    try {
        const { data, error } = await supabase
            .from('transfers')
            .select('*')
            .eq('code', code)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Code not found' });

        const now = new Date();
        const expiresAt = new Date(data.expires_at);

        if (now > expiresAt) {
            await purgeTransfer(data);
            return res.status(404).json({ error: 'Code expired' });
        }

        res.json({ expires: Math.max(0, Math.floor((expiresAt - now) / 1000)) });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/download/:code
app.get('/api/download/:code', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase not initialized' });
    const code = req.params.code.toUpperCase();
    if (!CODE_REGEX.test(code)) return res.status(400).json({ error: 'Invalid code format' });

    try {
        const { data, error } = await supabase
            .from('transfers')
            .select('*')
            .eq('code', code)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Code not found' });

        // Download from Storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('transfers')
            .download(data.file_path);

        if (downloadError) throw downloadError;

        const buffer = Buffer.from(await fileData.arrayBuffer());

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(data.filename)}"`);
        res.setHeader('Content-Type', data.mimetype || 'application/octet-stream');
        res.setHeader('Content-Length', data.size);
        res.send(buffer);

        // Purge after download
        await purgeTransfer(data);
    } catch (error) {
        console.error('[DOWNLOAD ERROR]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

async function purgeTransfer(transfer) {
    if (!supabase) return;
    try {
        await supabase.storage.from('transfers').remove([transfer.file_path]);
        await supabase.from('transfers').delete().eq('code', transfer.code);
    } catch (err) {
        console.error('[PURGE ERROR]', err);
    }
}

// Serve static files (For Local Dev)
if (process.env.NODE_ENV !== 'production') {
    app.use(express.static(path.join(__dirname, '../public')));
}

module.exports = app;
