import { caesarShift, caesarDecrypt } from './caesar-cipher';

export const SCENE1_MESSAGE = 'MEET AT THE SERVER ROOM';
export const SCENE1_KEY = 11;

export function encryptWithSharedKey(plaintext: string, key: number): string {
  return caesarShift(plaintext, key);
}

export function decryptWithSharedKey(ciphertext: string, key: number): string {
  return caesarDecrypt(ciphertext, key);
}
