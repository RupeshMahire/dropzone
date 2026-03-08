// State
let isPhoneMode = window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent);
let currentCode = null;
let currentTimer = null;
const TTL_SECONDS = 600;

// DOM Elements
const body = document.body;
const btnPc = document.getElementById('btn-pc');
const btnPhone = document.getElementById('btn-phone');
const btnPcMobile = document.getElementById('btn-pc-mobile');
const btnPhoneMobile = document.getElementById('btn-phone-mobile');
const hamburgerBtn = document.getElementById('hamburger-btn');
const mobileNav = document.getElementById('mobile-nav');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const sendDetails = document.getElementById('send-code-state');
const codeDisplay = document.getElementById('code-display');
const filenameDisplay = document.getElementById('filename-display');
const timeRing = document.getElementById('time-ring');
const timeText = document.getElementById('time-text');
const receiveZone = document.getElementById('panel-recv');
const codeInputs = document.querySelectorAll('.digit-input');
const btnReceive = document.getElementById('btn-receive');
const errorMsg = document.getElementById('error-msg');
const dropZoneUploadState = document.getElementById('send-upload-state');
const panelSend = document.getElementById('panel-send');

// Supabase Global Client Instance
let supabaseClient;

async function initSupabase() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        if (config.supabaseUrl && config.supabaseAnonKey) {
            // Use the global 'supabase' object from the CDN
            supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            console.log("Supabase initialized");
        }
    } catch (err) {
        console.error("Supabase Init Error:", err);
    }
}

// Initialization
async function init() {
    createParticles();
    setMode(isPhoneMode);
    await initSupabase();

    // Event Listeners
    if (btnPc) btnPc.addEventListener('click', () => setMode(false));
    if (btnPhone) btnPhone.addEventListener('click', () => setMode(true));
    if (btnPcMobile) btnPcMobile.addEventListener('click', () => { setMode(false); toggleMobileNav(false); });
    if (btnPhoneMobile) btnPhoneMobile.addEventListener('click', () => { setMode(true); toggleMobileNav(false); });

    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', () => toggleMobileNav());
    }

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

function generateSafeCode() {
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function handleFile(file) {
    if (file.size > 50 * 1024 * 1024) {
        alert("File extremely large. Max 50MB.");
        return;
    }

    if (!supabaseClient) {
        alert("Initializing connection... please wait.");
        await initSupabase();
        if (!supabaseClient) return;
    }

    try {
        const iconSvg = dropZone.querySelector('.icon-circle svg');
        if (iconSvg) iconSvg.style.animation = 'float-particle 1s infinite alternate';

        const fileCode = generateSafeCode();
        const fileExt = file.name.split('.').pop();
        const fileName = `${fileCode}-${Date.now()}.${fileExt}`;
        const filePath = `transfers/${fileName}`;

        // 1. Direct Upload to Supabase Storage
        const { data, error } = await supabaseClient.storage
            .from('transfers')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // 2. Register Metadata with Backend
        const metadataRes = await fetch('/api/upload-metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: fileCode,
                filename: file.name,
                mimetype: file.type,
                size: file.size,
                file_path: filePath
            })
        });

        if (!metadataRes.ok) {
            const errData = await metadataRes.json();
            throw new Error(errData.error || "Failed to register transfer");
        }

        const metadata = await metadataRes.json();
        showUploadSuccess(metadata.code, file.name, file.size, metadata.expires);

    } catch (err) {
        console.error("Upload Error:", err);
        alert("Upload error: " + (err.message || "Unknown error"));
        const iconSvg = dropZone.querySelector('.icon-circle svg');
        if (iconSvg) iconSvg.style.animation = 'none';
    }
}

function toggleMobileNav(force) {
    if (!mobileNav || !hamburgerBtn) return;
    const isOpen = force !== undefined ? force : !mobileNav.classList.contains('active');
    mobileNav.classList.toggle('active', isOpen);
    hamburgerBtn.classList.toggle('active', isOpen);
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
        if (btnPhone) btnPhone.classList.add('active');
        if (btnPhoneMobile) btnPhoneMobile.classList.add('active');
        if (btnPc) btnPc.classList.remove('active');
        if (btnPcMobile) btnPcMobile.classList.remove('active');

        panelSend.classList.remove('active');
        receiveZone.classList.add('active');

        if (window.innerWidth > 768 && codeInputs.length > 0) codeInputs[0].focus();
    } else {
        if (btnPc) btnPc.classList.add('active');
        if (btnPcMobile) btnPcMobile.classList.add('active');
        if (btnPhone) btnPhone.classList.remove('active');
        if (btnPhoneMobile) btnPhoneMobile.classList.remove('active');

        receiveZone.classList.remove('active');
        panelSend.classList.add('active');
    }
    errorMsg.classList.add('hidden');
}

function resetSendFlow() {
    currentCode = null;
    if (currentTimer) clearInterval(currentTimer);
    sendDetails.classList.add('display-none');
    dropZoneUploadState.classList.remove('display-none');
    dropZone.classList.remove('hidden');
    fileInput.value = '';
}

function resetRecvFlow() {
    const successResult = document.getElementById('recv-success-state');
    if (successResult) successResult.classList.add('display-none');
    const inputState = document.getElementById('recv-input-state');
    if (inputState) inputState.classList.remove('display-none');
    codeInputs.forEach(i => i.value = '');
    checkReceiveReady();
    if (codeInputs.length > 0) codeInputs[0].focus();
}

// --- CORE LOGIC: SUPABASE UPLOAD ---
function handleDrop(e) {
    e.preventDefault();
    dropZone.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
}

function showUploadSuccess(code, filename, size, startTtl) {
    currentCode = code;
    dropZoneUploadState.classList.add('display-none');
    sendDetails.classList.remove('display-none');

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

    errorMsg.classList.add('hidden');
    btnReceive.textContent = 'CONNECTING...';
    btnReceive.disabled = true;

    try {
        // 1. Check status first (optional but good for UX)
        const statusRes = await fetch(`/api/status/${code}`);
        const statusContentType = statusRes.headers.get("content-type");

        if (!statusRes.ok) {
            let errorMessage = "Invalid code";
            if (statusContentType && statusContentType.includes("application/json")) {
                const err = await statusRes.json();
                errorMessage = err.error || errorMessage;
            }
            throw new Error(errorMessage);
        }

        // 2. Trigger download via backend endpoint
        // Using window.location.href or a temporary link to the download endpoint
        const downloadUrl = `/api/download/${code}`;

        const a = document.createElement('a');
        a.href = downloadUrl;
        // The backend sets Content-Disposition, but we can hint it here
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showReceiveSuccess();

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
document.addEventListener('DOMContentLoaded', init);
