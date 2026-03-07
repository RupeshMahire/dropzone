const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();

// Security and Performance
app.use(helmet({
    contentSecurityPolicy: false, // Allow external fonts/scripts for this demo
}));
app.use(compression());
app.set('trust proxy', 1);

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use(limiter);

// In-memory store
const fileStore = new Map();

// Multer setup
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Helper for 4-digit codes
const generateSafeCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, 0, I, 1
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return fileStore.has(code) ? generateSafeCode() : code;
};

// Endpoints
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const code = generateSafeCode();
    const fileData = {
        id: uuidv4(),
        filename: req.file.originalname,
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        size: req.file.size,
        expires: Date.now() + (10 * 60 * 1000) // 10 mins
    };

    fileStore.set(code, fileData);

    res.json({
        code,
        filename: fileData.filename,
        size: fileData.size,
        expires: 600 // 10 mins in seconds
    });
});

app.get('/api/download/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const file = fileStore.get(code);

    if (!file) {
        return res.status(404).json({ error: 'File not found or expired' });
    }

    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.send(file.buffer);

    // Delete after one download
    fileStore.delete(code);
});

// Error Handling
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Max 50MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) {
        console.error('[API ERROR]', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
    next();
});

// Expiry Cleanup (Run every minute)
setInterval(() => {
    const now = Date.now();
    for (const [code, file] of fileStore.entries()) {
        if (now > file.expires) {
            fileStore.delete(code);
        }
    }
}, 60000);

module.exports = app;
