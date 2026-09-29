'use strict';
// Provider API keys are encrypted in the browser against this worker's public key.
// The private key never leaves the worker host, so the database only ever holds
// ciphertext that nobody else can open.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const KEY_ID = 'capture-worker';

function loadKeyPair(root) {
  const file = path.join(root, 'worker-key.pem');
  if (fs.existsSync(file)) {
    const privateKey = crypto.createPrivateKey(fs.readFileSync(file, 'utf8'));
    return { privateKey, publicKey: crypto.createPublicKey(privateKey) };
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 4096 });
  fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  return { privateKey, publicKey };
}

function exportPublicKey(publicKey) {
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

function decrypt(privateKey, value) {
  if (!value) return '';
  return crypto
    .privateDecrypt(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(value, 'base64'),
    )
    .toString('utf8');
}

module.exports = { KEY_ID, loadKeyPair, exportPublicKey, decrypt };
