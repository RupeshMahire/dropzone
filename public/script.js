// ----- Particles Generator -----
const particlesContainer = document.getElementById('particles');
for (let i = 0; i < 25; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 5 + 3; // 3-8px
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${Math.random() * 100}%`;
    p.style.top = `${Math.random() * 100}%`;
    p.style.animationDuration = `${Math.random() * 12 + 8}s`; // 8-20s
    p.style.animationDelay = `${Math.random() * 10}s`;
    p.style.opacity = Math.random() * 0.4 + 0.2; // 0.2 - 0.6
    particlesContainer.appendChild(p);
}

// ----- Responsive UI Setup -----
const btnSendModes = document.querySelectorAll('.btn-send-mode');
const btnRecvModes = document.querySelectorAll('.btn-recv-mode');
const panelSend = document.getElementById('panel-send');
const panelRecv = document.getElementById('panel-recv');
const mobileNav = document.getElementById('mobile-nav');
const hamburgerBtn = document.getElementById('hamburger-btn');

hamburgerBtn.addEventListener('click', () => {
    mobileNav.classList.toggle('open');
    hamburgerBtn.classList.toggle('open');
});

function switchMode(mode) {
    if (mode === 'send') {
        btnSendModes.forEach(btn => btn.classList.add('active'));
        btnRecvModes.forEach(btn => btn.classList.remove('active'));
        panelSend.classList.add('active');
        panelRecv.classList.remove('active');
    } else {
        btnRecvModes.forEach(btn => btn.classList.add('active'));
        btnSendModes.forEach(btn => btn.classList.remove('active'));
        panelRecv.classList.add('active');
        panelSend.classList.remove('active');
        // Auto focus first digit
        setTimeout(() => document.getElementById('d1').focus(), 100);
    }
    mobileNav.classList.remove('open');
    hamburgerBtn.classList.remove('open');
}

btnSendModes.forEach(btn => btn.addEventListener('click', () => switchMode('send')));
btnRecvModes.forEach(btn => btn.addEventListener('click', () => switchMode('recv')));

// Auto detect mobile to default to receive
if (window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent)) {
    switchMode('recv');
}

// ----- Formatting Utils -----
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ----- SEND FILE LOGIC -----
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadState = document.getElementById('send-upload-state');
const codeState = document.getElementById('send-code-state');

// Drag & Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
    dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); });
});

['dragenter', 'dragover'].forEach(ev => {
    dropZone.addEventListener(ev, () => dropZone.classList.add('dragover'));
});

['dragleave', 'drop'].forEach(ev => {
    dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover'));
});

dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        uploadFile(e.dataTransfer.files[0]);
    }
});

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        uploadFile(e.target.files[0]);
    }
});

let currentInterval = null;

async function uploadFile(file) {
    if (file.size > 50 * 1024 * 1024) {
        alert("File too large. Max 50MB.");
        return;
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        // Show loading state implicitly on drop zone icon
        const iconSvg = dropZone.querySelector('.icon-circle svg');
        iconSvg.style.animation = 'float-particle 1s infinite alternate';

        const res = await fetch('api/upload', { method: 'POST', body: formData });

        // Robust Error Handling
        if (!res.ok) {
            let errorMsg = 'Upload failed';
            const resClone = res.clone(); // Clone to allow double reading
            try {
                const data = await res.json();
                errorMsg = data.error || errorMsg;
            } catch (e) {
                // Read from clone since original stream is consumed
                const text = await resClone.text();
                errorMsg = text.substring(0, 100) || errorMsg;
            }
            throw new Error(errorMsg);
        }

        const data = await res.json();
        showUploadSuccess(data.code, data.filename, data.size, data.expires);

    } catch (err) {
        alert("Upload error: " + err.message);
    } finally {
        const iconSvg = dropZone.querySelector('.icon-circle svg');
        iconSvg.style.animation = '';
    }
}

function showUploadSuccess(code, filename, size, ttl) {
    uploadState.style.display = 'none';
    codeState.style.display = 'flex';

    document.getElementById('sent-file-info').textContent = `${filename} (${formatBytes(size)})`;

    // Animate code boxes
    const boxes = document.querySelectorAll('.code-digit');
    for (let i = 0; i < 4; i++) {
        boxes[i].textContent = code[i];
        boxes[i].classList.remove('drop-in');

        // Trigger reflow
        void boxes[i].offsetWidth;

        boxes[i].style.animationDelay = `${i * 0.1}s`;
        boxes[i].classList.add('drop-in');
    }

    // Countdown loop
    let maxTime = ttl;
    let timeLeft = ttl;

    const circle = document.getElementById('countdown-circle');
    const timeTxt = document.getElementById('countdown-text');
    const warnTxt = document.getElementById('warning-time');

    circle.style.strokeDashoffset = '0';
    timeTxt.textContent = formatTime(timeLeft);
    warnTxt.textContent = formatTime(timeLeft);

    if (currentInterval) clearInterval(currentInterval);

    currentInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(currentInterval);
            timeTxt.textContent = "0:00";
            warnTxt.textContent = "0:00";
            circle.style.strokeDashoffset = '176';
            return;
        }

        timeTxt.textContent = formatTime(timeLeft);
        warnTxt.textContent = formatTime(timeLeft);

        const offset = 176 - (timeLeft / maxTime) * 176;
        circle.style.strokeDashoffset = offset;

    }, 1000);
}

function resetSendFlow() {
    if (currentInterval) clearInterval(currentInterval);
    fileInput.value = '';
    uploadState.style.display = 'flex';
    codeState.style.display = 'none';
}


// ----- RECEIVE FILE LOGIC -----
const inputs = [
    document.getElementById('d1'),
    document.getElementById('d2'),
    document.getElementById('d3'),
    document.getElementById('d4')
];
const btnReceive = document.getElementById('btn-receive');
const recvInputState = document.getElementById('recv-input-state');
const recvSuccessState = document.getElementById('recv-success-state');
const errorMsg = document.getElementById('recv-error');

// Auto advance inputs
inputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
        input.value = input.value.toUpperCase();
        if (input.value && index < 3) {
            inputs[index + 1].focus();
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
            inputs[index - 1].focus();
        } else if (e.key === 'Enter') {
            triggerReceive();
        }
    });

    // Paste support
    input.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (text.length >= 4) {
            inputs[0].value = text[0];
            inputs[1].value = text[1];
            inputs[2].value = text[2];
            inputs[3].value = text[3];
            inputs[3].focus();
        }
    });
});

btnReceive.addEventListener('click', triggerReceive);

async function triggerReceive() {
    const code = inputs.map(i => i.value).join('');
    if (code.length < 4) return;

    errorMsg.textContent = "";
    btnReceive.innerHTML = '<span class="loader">&middot;&middot;&middot;</span>';
    btnReceive.disabled = true;

    try {
        // Trigger download via fetch to handle errors gracefully manually, then download blob
        const res = await fetch(`api/download/${code}`);
        if (!res.ok) {
            let errorMsg = 'Download failed';
            const resClone = res.clone();
            try {
                const err = await res.json();
                errorMsg = err.error || errorMsg;
            } catch (e) {
                const text = await resClone.text();
                errorMsg = text.substring(0, 100) || errorMsg;
            }
            throw new Error(errorMsg);
        }

        const blob = await res.blob();

        // Use regex to try to extract filename from Content-Disposition header
        let filename = 'dropzone-file';
        const disposition = res.headers.get('Content-Disposition');
        if (disposition && disposition.indexOf('filename=') !== -1) {
            const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
            if (matches != null && matches[1]) {
                filename = decodeURIComponent(matches[1].replace(/['"]/g, ''));
            }
        }

        // Trigger blob download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);

        showReceiveSuccess();

    } catch (err) {
        errorMsg.textContent = "Invalid or expired code. Try again.";
        inputs.forEach(i => {
            i.classList.remove('invalid-shake');
            void i.offsetWidth; // reflow
            i.classList.add('invalid-shake');
        });
        btnReceive.innerHTML = 'RECEIVE FILE';
        btnReceive.disabled = false;
        inputs[0].focus();
    }
}

function showReceiveSuccess() {
    recvInputState.style.display = 'none';
    recvSuccessState.style.display = 'flex';
    btnReceive.innerHTML = 'RECEIVE FILE';
    btnReceive.disabled = false;
    inputs.forEach(i => i.value = '');

    // Screen Pulse shockwave
    const pulse = document.getElementById('pulse-overlay');
    pulse.classList.remove('pulse-active');
    void pulse.offsetWidth; // reflow
    pulse.classList.add('pulse-active');
}

function resetRecvFlow() {
    recvInputState.style.display = 'flex';
    recvSuccessState.style.display = 'none';
    inputs[0].focus();
}
