'use strict';

const decryptEmbeddedDocs = require('../util/decryptEmbeddedDocs');

/**
 * Export For Schemas That Contain Encrypted Embedded Documents
 *
 * This ensures that embedded documents are transparently decrypted after the parent is persisted
 *
 * For use in conjunction with the main encryption plugin.
 */

module.exports = function encryptedChildren(schema) {
  schema.post('save', doc => decryptEmbeddedDocs(doc));
};
