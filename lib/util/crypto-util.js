'use strict';

const crypto = require('crypto');

/**
 * Derives 512 bit key from a string secret
 *
 * @param      {string}  secret  The secret
 * @param      {string}  type    The type of key to generate. Can be any string.
 * @return     {Buffer}  512 bit key
 */
function deriveKey(secret, type) {
  const hmac = crypto.createHmac('sha512', secret);
  hmac.update(type);
  return Buffer.from(hmac.digest());
}

/**
 * Utility function: Zeros a buffer for security
 *
 * @param      {Buffer}  buf     The buffer
 */
function clearBuffer(buf) {
  for (let i = 0; i < buf.length; i++) {
    buf[i] = 0; // eslint-disable-line no-param-reassign
  }
}

/**
 * Drops 256 bits from a 512 bit buffer
 *
 * @param      {Buffer}  buf     A 512 bit buffer
 * @return     {Buffer}  A 256 bit buffer
 */
function drop256(buf) {
  const buf256 = Buffer.alloc(32);
  buf.copy(buf256, 0, 0, 32);

  clearBuffer(buf);
  return buf256;
}

module.exports = {
  deriveKey,
  clearBuffer,
  drop256
};
