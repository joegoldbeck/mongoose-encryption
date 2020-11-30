/**
 * Derives 512 bit key from a string secret
 *
 * @param      {string}  secret  The secret
 * @param      {string}  type    The type of key to generate. Can be any string.
 * @return     {Buffer}  512 bit key
 */
export function deriveKey(secret: string, type: string): any;
/**
 * Utility function: Zeros a buffer for security
 *
 * @param      {Buffer}  buf     The buffer
 */
export function clearBuffer(buf: any): void;
/**
 * Drops 256 bits from a 512 bit buffer
 *
 * @param      {Buffer}  buf     A 512 bit buffer
 * @return     {Buffer}  A 256 bit buffer
 */
export function drop256(buf: any): any;
