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

  async storePrivateKey(userId: string, privateKeyJwk: JsonWebKey): Promise<void> {
    const db  = await this.openDb();
    const tx  = db.transaction(this.STORE_NAME, 'readwrite');
    const req = tx.objectStore(this.STORE_NAME).put({ userId, key: privateKeyJwk });
    return new Promise((resolve, reject) => {
      req.onsuccess    = () => resolve();
      req.onerror      = () => reject(req.error);
      tx.oncomplete    = () => resolve();
      tx.onerror       = () => reject(tx.error);
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
}