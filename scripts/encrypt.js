// encrypt.js

/**
 * 使用HMAC-SHA256生成签名
 * @param {string} secret - 密钥
 * @param {string} message - 要签名的消息 (这里是时间戳)
 * @returns {Promise<string>} - 返回Base64编码的签名
 */
async function generateSignature(secret, message) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(message);

    // 导入密钥
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    // 生成签名
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

    // 将签名转换为Base64字符串，方便在URL中传输
    return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
}

/**
 * 验证URL中的时间戳和签名
 * @param {string} secret - 密钥
 * @param {number} allowedTimeDifferenceSeconds - 允许的时间差（秒）
 * @returns {Promise<{valid: boolean, reason: string}>}
 */
async function verifyUrl(secret, allowedTimeDifferenceSeconds = 180) {
    const urlParams = new URLSearchParams(window.location.search);
    const timestamp = urlParams.get('ts');
    const signatureFromUrl = urlParams.get('sig');

    // 1. 检查参数是否存在
    if (!timestamp || !signatureFromUrl) {
        return { valid: false, reason: 'URL中缺少必要的参数 (ts 或 sig)。' };
    }

    // 2. 验证签名
    const expectedSignature = await generateSignature(secret, timestamp);

    if (expectedSignature !== signatureFromUrl) {
        return { valid: false, reason: '签名验证失败！链接可能被篡改或密钥不正确。' };
    }

    // 3. 验证时间戳
    const now = Math.floor(Date.now() / 1000); // 当前时间戳（秒）
    const linkTime = parseInt(timestamp, 10);
    const timeDifference = Math.abs(now - linkTime);

    if (timeDifference > allowedTimeDifferenceSeconds) {
        return { valid: false, reason: `链接已过期！生成时间与当前时间相差 ${Math.floor(timeDifference / 60)} 分钟。` };
    }

    // 所有验证通过
    return { valid: true, reason: '验证成功！' };
}

async function generateUrl() {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await generateSignature("'Why reinvent the wheel?'", timestamp.toString());

    // 构建新的URL
    const currentUrl = new URL(window.location.href.split('?')[0]); // 获取不带参数的基础URL
    currentUrl.searchParams.set('ts', timestamp);
    currentUrl.searchParams.set('sig', signature);
    return currentUrl.toString();
}
