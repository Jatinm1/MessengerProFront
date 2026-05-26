// crypto.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CryptoService {

  private readonly DB_NAME    = 'ChatAppKeys';
  private readonly DB_VERSION = 1;
  private readonly STORE_NAME = 'keys';

  // ============================================================================
  // INDEXEDDB
  // ============================================================================

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(this.STORE_NAME, { keyPath: 'userId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  // async storePrivateKey(userId: string, privateKeyJwk: JsonWebKey): Promise<void> {
  //   const db  = await this.openDb();
  //   const tx  = db.transaction(this.STORE_NAME, 'readwrite');
  //   const req = tx.objectStore(this.STORE_NAME).put({ userId, key: privateKeyJwk });
  //   return new Promise((resolve, reject) => {
  //     req.onsuccess    = () => resolve();
  //     req.onerror      = () => reject(req.error);
  //     tx.oncomplete    = () => resolve();
  //     tx.onerror       = () => reject(tx.error);
  //   });
  // }

  // crypto.service.ts — add logging to storePrivateKey and replacePrivateKey

async storePrivateKey(userId: string, privateKeyJwk: JsonWebKey): Promise<void> {
  console.trace('🔐 [E2EE] storePrivateKey called — stack trace above');
  console.log('🔐 [E2EE] Storing key with n:', (privateKeyJwk as any).n?.substring(0, 20));
  const db  = await this.openDb();
  const tx  = db.transaction(this.STORE_NAME, 'readwrite');
  const req = tx.objectStore(this.STORE_NAME).put({ userId, key: privateKeyJwk });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
  async replacePrivateKey(userId: string, privateKeyJwk: JsonWebKey): Promise<void> {
    await this.storePrivateKey(userId, privateKeyJwk);
  }

  async hasKeyForUser(userId: string): Promise<boolean> {
    try {
      const db  = await this.openDb();
      const tx  = db.transaction(this.STORE_NAME, 'readonly');
      const req = tx.objectStore(this.STORE_NAME).get(userId);
      return new Promise<boolean>((resolve) => {
        req.onsuccess = () => {
          const found = !!req.result;
          console.log(`🔐 [E2EE] IndexedDB lookup for ${userId} → ${found ? 'FOUND' : 'NOT FOUND'}`);
          resolve(found);
        };
        req.onerror = () => {
          console.error('🔐 [E2EE] IndexedDB get error:', req.error);
          resolve(false);
        };
      });
    } catch (err) {
      console.error('🔐 [E2EE] hasKeyForUser error:', err);
      return false;
    }
  }

  async getPrivateKey(userId: string): Promise<CryptoKey | null> {
    try {
      const db  = await this.openDb();
      const tx  = db.transaction(this.STORE_NAME, 'readonly');
      const req = tx.objectStore(this.STORE_NAME).get(userId);

      return new Promise<CryptoKey | null>((resolve) => {
        req.onsuccess = async () => {
          if (!req.result) {
            console.warn(`⚠️ [E2EE] No private key in IndexedDB for user ${userId}`);
            resolve(null);
            return;
          }
          try {
            const key = await crypto.subtle.importKey(
              'jwk',
              req.result.key,
              { name: 'RSA-OAEP', hash: 'SHA-256' },
              false,
              ['decrypt']
            );
            resolve(key);
          } catch (err) {
            console.error('❌ [E2EE] Failed to import private key:', err);
            resolve(null);
          }
        };
        req.onerror = () => {
          console.error('❌ [E2EE] IndexedDB read error:', req.error);
          resolve(null);
        };
      });
    } catch (err) {
      console.error('❌ [E2EE] getPrivateKey error:', err);
      return null;
    }
  }

  // ============================================================================
  // KEY GENERATION
  // ============================================================================

  async generateKeyPair(): Promise<{ publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey }> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name:           'RSA-OAEP',
        modulusLength:  2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash:           'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );
    const publicKeyJwk  = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    return { publicKeyJwk, privateKeyJwk };
  }

  // ============================================================================
  // ENCRYPT MESSAGE
  // Returns { ciphertext, iv, encryptedKeys }
  // Both ciphertext and iv are base64 strings.
  // They are joined as "iv:ciphertext" for storage in the Body column.
  // ============================================================================

  async encryptMessage(
    plaintext: string,
    recipients: { userId: string; jwk: JsonWebKey }[]
  ): Promise<{
    ciphertext:    string;
    iv:            string;
    encryptedKeys: { userId: string; encryptedKey: string }[];
  }> {
    // 1. Generate a random 12-byte IV (required size for AES-GCM)
    const ivBytes = crypto.getRandomValues(new Uint8Array(12));

    // 2. Generate a one-time AES-256-GCM key for this message
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // 3. Encrypt the plaintext
    const encoded       = new TextEncoder().encode(plaintext);
    const ciphertextBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ivBytes },
      aesKey,
      encoded
    );

    // 4. Export the raw AES key so we can wrap it per recipient
    const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);

    // 5. Wrap the AES key with each recipient's RSA public key
    const encryptedKeys = await Promise.all(
      recipients.map(async ({ userId, jwk }) => {
        const rsaPublicKey = await crypto.subtle.importKey(
          'jwk',
          jwk,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          false,
          ['encrypt']
        );
        const wrappedKey = await crypto.subtle.encrypt(
          { name: 'RSA-OAEP' },
          rsaPublicKey,
          rawAesKey
        );
        return {
          userId,
          encryptedKey: this.bufToBase64(wrappedKey)
        };
      })
    );

    return {
      iv:            this.bufToBase64(ivBytes),
      ciphertext:    this.bufToBase64(ciphertextBuf),
      encryptedKeys
    };
  }

  // ============================================================================
  // DECRYPT MESSAGE
  // ciphertext and iv are base64 strings (as stored/transmitted).
  // encryptedKey is the base64-wrapped AES key for this specific user.
  // ============================================================================

  async decryptMessage(
    ciphertext:   string,
    iv:           string,
    encryptedKey: string,
    privateKey:   CryptoKey
  ): Promise<string> {
    // 1. Unwrap the AES key using our RSA private key
    const wrappedKeyBytes = this.base64ToBuf(encryptedKey);
    const rawAesKey = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      wrappedKeyBytes
    );

    // 2. Import the unwrapped AES key
    const aesKey = await crypto.subtle.importKey(
      'raw',
      rawAesKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // 3. Decrypt the ciphertext
    const ivBytes         = this.base64ToBuf(iv);
    const ciphertextBytes = this.base64ToBuf(ciphertext);

    const plaintextBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      aesKey,
      ciphertextBytes
    );

    return new TextDecoder().decode(plaintextBuf);
  }

  // ============================================================================
  // BASE64 HELPERS
  // Using btoa/atob with proper byte handling — NOT TextEncoder/TextDecoder
  // which breaks on non-ASCII bytes in binary data.
  // ============================================================================

  bufToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary  = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToBuf(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // crypto.service.ts — add these methods

// ============================================================================
// KEY BACKUP (export private key encrypted with a user PIN)
// ============================================================================

/**
 * Exports the private key encrypted with a PIN using AES-256-GCM.
 * The PIN is stretched into a key using PBKDF2.
 * The server stores this blob — it cannot decrypt it without the PIN.
 */
async exportEncryptedKeyBackup(
  userId: string,
  pin: string
): Promise<{ encryptedBackup: string; salt: string } | null> {
  const privateKey = await this.getPrivateKey(userId);
  if (!privateKey) return null;

  // Re-export the private key JWK from IndexedDB raw storage
  const db  = await this.openDb();
  const tx  = db.transaction(this.STORE_NAME, 'readonly');
  const req = tx.objectStore(this.STORE_NAME).get(userId);

  

  return new Promise((resolve, reject) => {
    req.onsuccess = async () => {
      
      if (!req.result) { resolve(null); return; }

      try {
        const privateKeyJwk = req.result.key;
        const keyData       = new TextEncoder().encode(JSON.stringify(privateKeyJwk));

        // Derive an AES key from the PIN using PBKDF2
        const salt       = crypto.getRandomValues(new Uint8Array(16));
        const aesKey     = await this.deriveKeyFromPin(pin, salt);

        // Encrypt the private key JWK with the derived AES key
        const iv            = crypto.getRandomValues(new Uint8Array(12));
        const encryptedBuf  = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          aesKey,
          keyData
        );

        // Pack as iv(12) + ciphertext into one blob
        const packed = new Uint8Array(12 + encryptedBuf.byteLength);
        packed.set(iv, 0);
        packed.set(new Uint8Array(encryptedBuf), 12);
        try {
  const testAesKey = await this.deriveKeyFromPin(pin, salt);
  await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, testAesKey, encryptedBuf);
  console.log('✅ [E2EE] Backup self-verification passed');
} catch (verifyErr) {
  console.error('❌ [E2EE] Backup self-verification FAILED:', verifyErr);
  reject(new Error('Backup verification failed'));
  return;
}

        resolve({
          encryptedBackup: this.bufToBase64(packed),
          salt:            this.bufToBase64(salt)
        });
      } catch (err) {
        reject(err);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Decrypts a key backup blob using the PIN and stores the
 * recovered private key in IndexedDB on this device.
 */
// async importEncryptedKeyBackup(
//   userId:         string,
//   encryptedBackup: string,
//   saltB64:        string,
//   pin:            string
// ): Promise<boolean> {
//   try {
//     const packed   = this.base64ToBuf(encryptedBackup);
//     const salt     = this.base64ToBuf(saltB64);
//     const iv       = packed.slice(0, 12);
//     const ctBytes  = packed.slice(12);

//     // Derive the same AES key from the PIN
//     const aesKey = await this.deriveKeyFromPin(pin, salt);

//     // Decrypt the private key JWK
//     const decrypted = await crypto.subtle.decrypt(
//       { name: 'AES-GCM', iv },
//       aesKey,
//       ctBytes
//     );

//     const privateKeyJwk: JsonWebKey = JSON.parse(new TextDecoder().decode(decrypted));

//     // Validate by importing
//     await crypto.subtle.importKey(
//       'jwk',
//       privateKeyJwk,
//       { name: 'RSA-OAEP', hash: 'SHA-256' },
//       false,
//       ['decrypt']
//     );

//     // Store in IndexedDB
//     await this.storePrivateKey(userId, privateKeyJwk);
//     console.log('✅ [E2EE] Key backup imported successfully');
//     return true;

//   } catch (err) {
//     console.error('❌ [E2EE] Key import failed (wrong PIN?):', err);
//     return false;
//   }
// }

// crypto.service.ts — replace importEncryptedKeyBackup completely

async importEncryptedKeyBackup(
  userId:          string,
  encryptedBackup: string,
  saltB64:         string,
  pin:             string
): Promise<boolean> {
  try {
    // 1. Decode the packed blob
    const packed     = this.base64ToBuf(encryptedBackup);
    const salt       = this.base64ToBuf(saltB64);

    // Validate minimum length: 12 bytes IV + at least 1 byte ciphertext
    if (packed.length < 13) {
      console.error('❌ [E2EE] Backup blob too short:', packed.length);
      return false;
    }

    const iv       = packed.slice(0, 12);
    const ctBytes  = packed.slice(12);

    console.log('🔐 [E2EE] Deriving key from PIN...');

    // 2. Derive AES key from PIN — this is where wrong PIN causes OperationError
    const aesKey = await this.deriveKeyFromPin(pin, salt);

    console.log('🔐 [E2EE] Attempting AES-GCM decrypt...');

    // 3. Decrypt — throws OperationError if PIN is wrong (auth tag mismatch)
    let decrypted: ArrayBuffer;
    try {
      decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        ctBytes
      );
    } catch (decryptErr) {
      // This is the specific case: wrong PIN → auth tag verification fails
      console.error('❌ [E2EE] AES-GCM decrypt failed — wrong PIN:', decryptErr);
      return false;  // ← explicit early return, never reaches storePrivateKey
    }

    console.log('🔐 [E2EE] Decrypt succeeded, parsing JWK...');

    // 4. Parse the JWK
    let privateKeyJwk: JsonWebKey;
    try {
      privateKeyJwk = JSON.parse(new TextDecoder().decode(decrypted));
    } catch (parseErr) {
      console.error('❌ [E2EE] Failed to parse decrypted JWK:', parseErr);
      return false;
    }

    console.log('🔐 [E2EE] Validating key by import...');

    // 5. Validate the JWK is actually a valid RSA-OAEP private key
    try {
      await crypto.subtle.importKey(
        'jwk',
        privateKeyJwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['decrypt']
      );
    } catch (importErr) {
      console.error('❌ [E2EE] JWK validation failed:', importErr);
      return false;
    }

    // 6. Store in IndexedDB — only reached if ALL steps above succeeded
    await this.storePrivateKey(userId, privateKeyJwk);
    console.log('✅ [E2EE] Key backup imported and stored successfully');
    return true;

  } catch (err) {
    // Catch anything else unexpected
    console.error('❌ [E2EE] importEncryptedKeyBackup unexpected error:', err);
    return false;
  }
}

private async deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const pinKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310_000, hash: 'SHA-256' },
    pinKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// crypto.service.ts — add inside CryptoService class

// Get raw JWK object from IndexedDB (not an imported CryptoKey — the raw JsonWebKey)
async getPrivateKeyJwk(userId: string): Promise<JsonWebKey | null> {
  try {
    const db  = await this.openDb();
    const tx  = db.transaction(this.STORE_NAME, 'readonly');
    const req = tx.objectStore(this.STORE_NAME).get(userId);
    return new Promise<JsonWebKey | null>((resolve) => {
      req.onsuccess = () => resolve(req.result?.key ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// RSA private JWK already contains n and e which are the public components.
// No crypto operation needed — just extract those fields.
derivePublicJwkFromPrivate(privateJwk: JsonWebKey): JsonWebKey {
  return {
    kty:     privateJwk.kty,   // "RSA"
    n:       privateJwk.n,     // modulus   — public component
    e:       privateJwk.e,     // exponent  — public component
    alg:     'RSA-OAEP-256',
    ext:     true,
    key_ops: ['encrypt']
  };
}
}