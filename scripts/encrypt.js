// encrypt.js
async function generateSignature(secret, message) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(message);
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
}

async function verifyUrl(secret, allowedTimeDifferenceSeconds = 180) {
    const urlParams = new URLSearchParams(window.location.search);
    const timestamp = urlParams.get('ts');
    const signatureFromUrl = urlParams.get('sig');

    if (!timestamp || !signatureFromUrl) {
        return { valid: false, reason: 'Missing required parameters (ts or sig).' };
    }
    const expectedSignature = await generateSignature(secret, timestamp);

    if (expectedSignature !== signatureFromUrl) {
        return { valid: false, reason: 'Signature verification failed! The link may have been tampered with or the secret key is incorrect.' };
    }

    const now = Math.floor(Date.now() / 1000);
    const linkTime = parseInt(timestamp, 10);
    const timeDifference = Math.abs(now - linkTime);

    if (timeDifference > allowedTimeDifferenceSeconds) {
        return { valid: false, reason: `The link has expired! The time difference between the generation time and the current time is ${Math.floor(timeDifference / 60)} minutes.` };
    }

    return { valid: true, reason: 'Verification successful!' };
}

async function generateUrl() {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await generateSignature("'Why reinvent the wheel?'", timestamp.toString());

    const currentUrl = new URL(window.location.href.split('?')[0]);
    currentUrl.searchParams.set('ts', timestamp);
    currentUrl.searchParams.set('sig', signature);
    return currentUrl.toString();
}
