require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
let supabase;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseUrl.startsWith('http') && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[SUPABASE] Client initialized successfully');
  } catch (error) {
    console.error('[SUPABASE] Initialization error:', error.message);
  }
} else {
  console.warn('[SUPABASE] Warning: Valid SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for backend features.');
}


const app = express();
const PORT = process.env.PORT || 3000;

// Trust Proxy
app.set('trust proxy', 1);

// Security & Performance
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST']
}));
app.use(compression());
app.use(express.json());

// Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Upload limit reached. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

// Multer Config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Helpers
function generateSafeCode() {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const CODE_REGEX = /^[A-Z2-9]{4}$/;

// --- API ROUTES ---
const api = express.Router();

// POST /api/upload
api.post('/upload', uploadLimiter, upload.single('file'), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not initialized' });
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fileCode = generateSafeCode();
    const ttlSeconds = 600;
    const expiresAt = new Date(Date.now() + (ttlSeconds * 1000)).toISOString();

    // 1. Upload to Supabase Storage
    const fileExt = path.extname(req.file.originalname);
    const fileName = `${fileCode}-${Date.now()}${fileExt}`;
    const filePath = `transfers/${fileName}`;

    const { data: storageData, error: storageError } = await supabase.storage
      .from('transfers')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (storageError) throw storageError;

    // 2. Insert metadata into Database
    const { error: dbError } = await supabase
      .from('transfers')
      .insert({
        code: fileCode,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        expires_at: expiresAt,
        file_path: filePath
      });

    if (dbError) throw dbError;

    console.log(`[UPLOAD] ${fileCode} stored in Supabase`);
    res.json({
      code: fileCode,
      filename: req.file.originalname,
      size: req.file.size,
      expires: ttlSeconds
    });

  } catch (error) {
    console.error('[ERROR] Upload process failed:', error);
    res.status(500).json({ error: 'Internal server error during upload: ' + error.message });
  }
});

// GET /api/status/:code
api.get('/status/:code', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not initialized' });
  const code = req.params.code.toUpperCase();
  if (!CODE_REGEX.test(code)) return res.status(400).json({ error: 'Invalid code format' });

  try {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Code not found or expired' });

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
api.get('/download/:code', async (req, res) => {
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

    if (new Date() > new Date(data.expires_at)) {
      await purgeTransfer(data);
      return res.status(404).json({ error: 'Code expired' });
    }

    // Download from Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('transfers')
      .download(data.file_path);

    if (downloadError) throw downloadError;

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(data.filename)}"`);
    res.setHeader('Content-Type', data.mimetype || 'application/octet-stream');
    res.setHeader('Content-Length', data.size);

    // Convert Blob/Buffer to stream or send directly
    const buffer = Buffer.from(await fileData.arrayBuffer());
    res.send(buffer);

    // Purge after download
    await purgeTransfer(data);
    console.log(`[DOWNLOAD] ${code} served and purged`);

  } catch (error) {
    console.error('[ERROR] Download process failed:', error);
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

app.use('/api', api);
app.use(express.static(path.join(__dirname, 'public')));

// Purge Interval (Expired entries)
setInterval(async () => {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .lt('expires_at', new Date().toISOString());

    if (data && data.length > 0) {
      for (const transfer of data) {
        await purgeTransfer(transfer);
      }
      console.log(`[PURGER] Cleaned up ${data.length} expired file(s)`);
    }
  } catch (err) {
    console.error('[PURGER ERROR]', err);
  }
}, 60000);

// Error Handling
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 50MB.' });
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    console.error('[UNHANDLED ERROR]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[READY] DROPZONE Server running on PORT ${PORT}`);
});

module.exports = app;
