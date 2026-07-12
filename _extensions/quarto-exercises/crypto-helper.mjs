import crypto from 'node:crypto';

let inputData = '';
process.stdin.on('data', chunk => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    if (!inputData.trim()) {
      process.exit(0);
    }
    const spec = JSON.parse(inputData);
    
    // Get the symmetric master key from the spec payload
    const masterKey = spec.key;
    if (!masterKey || masterKey.trim() === "") {
      console.error("quarto-exercises error: QUARTO_EXERCISES_KEY is missing or empty.");
      process.exit(1);
    }
    
    // Hash master key to derive a stable 32-byte key buffer
    const masterKeyBuffer = crypto.createHash('sha256').update(masterKey).digest();
    
    // Derive a page-specific key using the documentId
    const documentId = spec.documentId || 'default-doc';
    const pageKey = crypto.createHash('sha256').update(Buffer.concat([
      masterKeyBuffer,
      Buffer.from(':', 'utf8'),
      Buffer.from(documentId, 'utf8')
    ])).digest();
    
    // Additional Authenticated Data (AAD): documentId + exerciseId + controlId
    const exerciseId = spec.id || 'default';
    const controlId = spec.controlId || 'default';
    const aad = `${documentId}:${exerciseId}:${controlId}`;
    
    // Encrypt the answer/metadata spec using AES-256-GCM
    const iv = crypto.randomBytes(12); // 96-bit random IV
    const cipher = crypto.createCipheriv('aes-256-gcm', pageKey, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    
    const plaintext = JSON.stringify(spec);
    let ciphertext = cipher.update(plaintext, 'utf8');
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const tag = cipher.getAuthTag(); // 16-byte GCM authentication tag
    
    // Single GCM payload representation: iv (24 hex chars) + ciphertext (variable) + tag (32 hex chars)
    const payloadHex = iv.toString('hex') + ciphertext.toString('hex') + tag.toString('hex');
    
    const result = {
      payload: payloadHex,
      pageKey: pageKey.toString('hex')
    };
    
    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    console.error("crypto-helper error:", err);
    process.exit(1);
  }
});
