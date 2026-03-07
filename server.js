const express = require('express');
const multer = require('multer');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Proxy (Required for many hosting providers like Vercel, Heroku, etc.)
app.set('trust proxy', 1);

// Security & Performance Middleware
app.use(helmet());
app.use(compression());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

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
  max: 20, // Increased slightly for better UX
  message: { error: 'Upload limit reached. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply global limiter
app.use(globalLimiter);

// In-memory store: files = new Map()
// Key: 4-digit code (e.g. "7K3M")
// Value: { buffer, mimetype, originalname, size, expires: timestamp }
const files = new Map();

// Configure multer for memory storage - NO disk writes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Generate a random 4-character alphanumeric code (excluding ambiguous chars 0,O,1,I,L)
function generateSafeCode() {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (files.has(code)); // Ensure collision-safe
  return code;
}

// POST /upload - Upload a file
app.post('/upload', uploadLimiter, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileCode = generateSafeCode();
    const ttlSeconds = 600; // 10 minutes
    const expiresAt = Date.now() + (ttlSeconds * 1000);

    files.set(fileCode, {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      size: req.file.size,
      expires: expiresAt
    });

    console.log(`[UPLOAD] File stored: ${fileCode} (${req.file.originalname})`);

    res.json({
      code: fileCode,
      filename: req.file.originalname,
      size: req.file.size,
      expires: ttlSeconds
    });
  } catch (error) {
    console.error('[ERROR] Upload failed:', error);
    res.status(500).json({ error: 'Internal server error during upload' });
  }
});

// GET /status/:code - Get remaining TTL for a code
app.get('/status/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const fileData = files.get(code);

  if (!fileData) {
    return res.status(404).json({ error: 'Code not found or expired' });
  }

  const remainingSeconds = Math.max(0, Math.floor((fileData.expires - Date.now()) / 1000));

  if (remainingSeconds === 0) {
    // Should be caught by the purger, but cleanup just in case
    files.delete(code);
    return res.status(404).json({ error: 'Code expired' });
  }

  res.json({ expires: remainingSeconds });
});

// GET /download/:code - Download a file and immediately destroy it
app.get('/download/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const fileData = files.get(code);

  if (!fileData) {
    return res.status(404).json({ error: 'Code not found or expired' });
  }

  if (Date.now() > fileData.expires) {
    files.delete(code);
    return res.status(404).json({ error: 'Code expired' });
  }

  // Set headers to trigger a download
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.originalname)}"`);
  res.setHeader('Content-Type', fileData.mimetype || 'application/octet-stream');
  res.setHeader('Content-Length', fileData.size);

  // Send the buffer directly
  res.send(fileData.buffer);

  // IMMEDIATELY DELETE FROM MEMORY (Ephemeral by design)
  files.delete(code);
  console.log(`[DOWNLOAD] File served and destroyed: ${code}`);
});

// Purge Interval: Every 60s, remove expired entries
setInterval(() => {
  const now = Date.now();
  let purgedCount = 0;
  for (const [code, fileData] of files.entries()) {
    if (now > fileData.expires) {
      files.delete(code);
      purgedCount++;
    }
  }
  if (purgedCount > 0) {
    console.log(`[PURGER] Cleaned up ${purgedCount} expired file(s)`);
  }
}, 60000);

// Error Handling Middleware for Multer and others
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Max 50MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    console.error('[UNHANDLED ERROR]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
  next();
});

// Graceful shutdown: Clean up everything
process.on('SIGINT', () => {
  console.log('\n[SHUTTING DOWN] Clearing all files from memory...');
  files.clear();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTTING DOWN] Clearing all files from memory...');
  files.clear();
  process.exit(0);
});

// Local server startup (only if run directly)
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[READY] DROPZONE Server running on PORT ${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
