const fs = require('fs');

async function testFlow() {
    const fileContent = 'Supabase End-to-End Test ' + Date.now();
    const testFile = 'test_final.txt';

    try {
        console.log('--- Phase 1: Uploading ---');
        const formData = new FormData();
        const blob = new Blob([fileContent], { type: 'text/plain' });
        formData.append('file', blob, testFile);

        const uploadRes = await fetch('http://localhost:3000/api/upload', {
            method: 'POST',
            body: formData
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
            throw new Error('Upload failed: ' + (uploadData.error || uploadRes.statusText));
        }

        const { code } = uploadData;
        console.log('Upload Success, Code:', code);

        console.log('\n--- Phase 2: Status Check (with retry) ---');
        let statusSuccess = false;
        for (let i = 0; i < 3; i++) {
            console.log(`Attempt ${i + 1}...`);
            const statusRes = await fetch(`http://localhost:3000/api/status/${code}`);
            if (statusRes.ok) {
                statusSuccess = true;
                break;
            }
            const err = await statusRes.json();
            console.log('Status Check Error:', err.error);
            await new Promise(r => setTimeout(r, 2000));
        }

        if (!statusSuccess) throw new Error('Status check failed after retries');
        console.log('Status Check Success');

        console.log('\n--- Phase 3: Downloading ---');
        const downloadRes = await fetch(`http://localhost:3000/api/download/${code}`);
        if (!downloadRes.ok) {
            const err = await downloadRes.json();
            throw new Error('Download failed: ' + err.error);
        }
        const downloadedContent = await downloadRes.text();

        if (downloadedContent === fileContent) {
            console.log('Download Success, Content matches!');
            console.log('DONE: ALL PHASES PASSED');
        } else {
            console.error('Download Mismatch!');
            process.exit(1);
        }

    } catch (err) {
        console.error('\nTEST FAILED:', err.message);
        process.exit(1);
    }
}

testFlow();
