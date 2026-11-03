import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(config.encryptionKey, 'hex');
}

export function encryptFile(inputBuffer: Buffer): { encrypted: Buffer; iv: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  
  const encrypted = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Store auth tag appended to encrypted data
  const result = Buffer.concat([encrypted, authTag]);
  
  return {
    encrypted: result,
    iv: iv.toString('hex'),
  };
}

export function decryptFile(encryptedBuffer: Buffer, ivHex: string): Buffer {
  const iv = Buffer.from(ivHex, 'hex');
  
  // Extract auth tag from end
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - AUTH_TAG_LENGTH);
  const encrypted = encryptedBuffer.subarray(0, encryptedBuffer.length - AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function computeChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function saveEncryptedFile(
  fileBuffer: Buffer,
  filename: string
): Promise<{ filePath: string; iv: string; checksum: string }> {
  const checksum = computeChecksum(fileBuffer);
  const { encrypted, iv } = encryptFile(fileBuffer);
  
  const filePath = path.join(config.uploadDir, filename);
  fs.writeFileSync(filePath, encrypted);
  
  return { filePath, iv, checksum };
}

export async function readDecryptedFile(filePath: string, iv: string): Promise<Buffer> {
  const encrypted = fs.readFileSync(filePath);
  return decryptFile(encrypted, iv);
}
