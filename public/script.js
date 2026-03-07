// --- SUPABASE CONFIGURATION ---
// Replace these with your actual Supabase project credentials
const SUPABASE_URL = 'https://ltdnhicqdrkzioyzudri.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0ZG5oaWNxZHJremlveXp1ZHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjUxOTYsImV4cCI6MjA4ODQ0MTE5Nn0.44XwDCrxSeUWb0a9CwaE8QrujrB6TMTH_ZbWpixDoEY';

// Initialize Supabase Client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let isPhoneMode = window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent);
let currentCode = null;
let currentTimer = null;
const TTL_SECONDS = 600;

// DOM Elements
const body = document.body;
const btnPc = document.getElementById('btn-pc');
const btnPhone = document.getElementById('btn-phone');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const sendDetails = document.getElementById('send-details');
const codeDisplay = document.getElementById('code-display');
const filenameDisplay = document.getElementById('filename-display');
const timeRing = document.getElementById('time-ring');
const timeText = document.getElementById('time-text');
const receiveZone = document.getElementById('receive-zone');
const codeInputs = document.querySelectorAll('.code-input input');
const btnReceive = document.getElementById('btn-receive');
const errorMsg = document.getElementById('error-msg');

// Initialization
function init() {
    createParticles();
    setMode(isPhoneMode);

    // Event Listeners
    btnPc.addEventListener('click', () => setMode(false));
    btnPhone.addEventListener('click', () => setMode(true));

    // Upload Listeners
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--text-glow)'; });
    dropZone.addEventListener('dragleave', () => dropZone.style.borderColor = 'rgba(255, 255, 255, 0.2)');
    dropZone.addEventListener('drop', handleDrop);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    // Download Listeners
    codeInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => handleCodeInput(e, index));
        input.addEventListener('keydown', (e) => handleCodeBackspace(e, index));
        input.addEventListener('paste', handleCodePaste);
    });
    btnReceive.addEventListener('click', triggerReceive);
}

// Visuals
function createParticles() {
    const defaultParticleCount = isPhoneMode ? 15 : 30;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const count = prefersReducedMotion ? 5 : defaultParticleCount;

    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + 'vw';
        p.style.top = Math.random() * 100 + 'vh';
        p.style.animationDuration = (Math.random() * 10 + 10) + 's';
        p.style.animationDelay = (Math.random() * -20) + 's';
        body.appendChild(p);
    }
}

function setMode(toPhone) {
    isPhoneMode = toPhone;
    if (isPhoneMode) {
        btnPhone.classList.add('active');
        btnPc.classList.remove('active');
        dropZone.classList.add('hidden');
        sendDetails.classList.add('hidden');
        receiveZone.classList.remove('hidden');
        // Focus first input on phone mode if not mobile (prevents keyboard pop on actual mobile)
        if (window.innerWidth > 768) codeInputs[0].focus();
    } else {
        btnPc.classList.add('active');
        btnPhone.classList.remove('active');
        receiveZone.classList.add('hidden');
        if (currentCode) {
            sendDetails.classList.remove('hidden');
        } else {
            dropZone.classList.remove('hidden');
        }
    }
    errorMsg.classList.add('hidden');
}

// Generate 4 digit collision resistant code
function generateCode() {
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// --- CORE LOGIC: SUPABASE UPLOAD ---
function handleDrop(e) {
    e.preventDefault();
    dropZone.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
}

async function handleFile(file) {
    if (file.size > 50 * 1024 * 1024) {
        alert("File extremely large. Max 50MB.");
        return;
    }

    if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
        alert("Supabase is not configured! Please set your URL and ANON_KEY in script.js");
        return;
    }

    try {
        // Show loading state
        const iconSvg = dropZone.querySelector('.icon-circle svg');
        iconSvg.style.animation = 'float-particle 1s infinite alternate';

        const code = generateCode();
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
        const filePath = `${code}-${Math.random().toString(36).substring(7)}-${safeName}`;

        // 1. Upload file to Supabase Storage (Bucket name: 'dropzone')
        const { data: storageData, error: storageError } = await supabase.storage
            .from('dropzone')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (storageError) throw new Error("Storage Upload Failed: " + storageError.message);

        // 2. Insert metadata into Supabase Database (Table: 'files')
        const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
        const { error: dbError } = await supabase
            .from('files')
            .insert([
                {
                    code: code,
                    file_path: filePath,
                    filename: file.name,
                    expires_at: expiresAt
                }
            ]);

        if (dbError) throw new Error("Database Logic Failed: " + dbError.message);

        showUploadSuccess(code, file.name, file.size, TTL_SECONDS);

    } catch (err) {
        alert("Upload error: " + err.message);
        const iconSvg = dropZone.querySelector('.icon-circle svg');
        iconSvg.style.animation = 'none';
    }
}

function showUploadSuccess(code, filename, size, startTtl) {
    currentCode = code;
    dropZone.classList.add('hidden');
    sendDetails.classList.remove('hidden');

    // Staggered animation for code digits
    codeDisplay.innerHTML = '';
    for (let i = 0; i < code.length; i++) {
        const span = document.createElement('span');
        span.className = 'digit dropped';
        span.textContent = code[i];
        span.style.animationDelay = (i * 0.1) + 's';
        codeDisplay.appendChild(span);
    }

    filenameDisplay.textContent = `${filename} (${(size / 1024 / 1024).toFixed(2)} MB)`;

    startTimer(startTtl);
}

function startTimer(secondsLeft) {
    if (currentTimer) clearInterval(currentTimer);

    let left = secondsLeft;
    const total = 600; // 10 minutes max visually

    const updateRing = () => {
        if (left <= 0) {
            clearInterval(currentTimer);
            timeText.textContent = "0:00";
            timeRing.style.strokeDashoffset = 283;
            timeRing.style.stroke = '#ff3366';
            filenameDisplay.textContent = "Expired. Please upload again.";
            filenameDisplay.style.color = '#ff3366';
            currentCode = null;
            return;
        }

        const mins = Math.floor(left / 60);
        const secs = left % 60;
        timeText.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

        // Ring math: max dasharray is ~283 (2 * pi * 45)
        const offset = 283 - (left / total) * 283;
        timeRing.style.strokeDashoffset = offset;

        if (left < 60) timeRing.style.stroke = '#ff3366';

        left--;
    };

    updateRing();
    currentTimer = setInterval(updateRing, 1000);
}

// --- CORE LOGIC: SUPABASE DOWNLOAD ---
function handleCodeInput(e, index) {
    const val = e.target.value.toUpperCase();
    e.target.value = val.replace(/[^A-Z0-9]/g, '');

    if (e.target.value && index < 3) {
        codeInputs[index + 1].focus();
    }
    checkReceiveReady();
}

function handleCodeBackspace(e, index) {
    if (e.key === 'Backspace' && !e.target.value && index > 0) {
        codeInputs[index - 1].focus();
        codeInputs[index - 1].value = '';
    }
    checkReceiveReady();
}

function handleCodePaste(e) {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 4);
    for (let i = 0; i < pasted.length; i++) {
        if (i < 4) {
            codeInputs[i].value = pasted[i];
            if (i < 3) codeInputs[i + 1].focus();
        }
    }
    checkReceiveReady();
}

function checkReceiveReady() {
    const code = Array.from(codeInputs).map(i => i.value).join('');
    btnReceive.disabled = code.length !== 4;
}

async function triggerReceive() {
    const code = Array.from(codeInputs).map(i => i.value).join('');
    if (code.length !== 4) return;

    if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
        showError("Supabase is not configured yet.");
        return;
    }

    errorMsg.classList.add('hidden');
    btnReceive.textContent = 'CONNECTING...';
    btnReceive.disabled = true;

    try {
        // 1. Fetch metadata from Supabase database
        const { data: fileRecords, error: dbError } = await supabase
            .from('files')
            .select('*')
            .eq('code', code);

        if (dbError) throw new Error(dbError.message);
        if (!fileRecords || fileRecords.length === 0) throw new Error("Code not found or expired.");

        const record = fileRecords[0];

        // 2. Check if expired
        if (new Date(record.expires_at) < new Date()) {
            throw new Error("This code has expired.");
        }

        // 3. Download from Supabase Storage using signed URL
        const { data: urlData, error: urlError } = await supabase.storage
            .from('dropzone')
            .createSignedUrl(record.file_path, 60, {
                download: record.filename
            });

        if (urlError) throw new Error("Failed to generate download link.");

        // Trigger the file download in the browser
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = urlData.signedUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showReceiveSuccess();

        // 4. (Optional) Cleanup: Delete the record so it's a one-time download
        await supabase.from('files').delete().eq('code', code);
        await supabase.storage.from('dropzone').remove([record.file_path]);

    } catch (err) {
        showError(err.message);
    } finally {
        btnReceive.textContent = 'RECEIVE FILE';
        checkReceiveReady();
    }
}

function showReceiveSuccess() {
    body.style.animation = 'screen-pulse 0.5s ease-out';
    setTimeout(() => { body.style.animation = ''; }, 500);

    codeInputs.forEach(i => {
        i.style.color = '#00D4FF';
        i.style.borderColor = '#00D4FF';
        i.style.textShadow = '0 0 10px rgba(0, 212, 255, 0.5)';
    });

    setTimeout(() => {
        codeInputs.forEach(i => {
            i.value = '';
            i.style.color = '';
            i.style.borderColor = '';
            i.style.textShadow = '';
        });
        checkReceiveReady();
        codeInputs[0].focus();
    }, 2000);
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
    // Shake animation
    receiveZone.style.animation = 'shake 0.4s';
    setTimeout(() => receiveZone.style.animation = '', 400);
}

// Add shake animation to stylesheet dynamically
const style = document.createElement('style');
style.textContent = `
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
}
`;
document.head.appendChild(style);

// Start
init();
