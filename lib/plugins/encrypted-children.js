'use strict';

var mongoose = require('mongoose');

/**
 * Export For Schemas That Contain Encrypted Embedded Documents
 *
 * This ensures that if parent has a validation error, children don't come out encrypted,
 * which could otherwise cause data loss if validation error fixed and a resave was attempted
 *
 * It also ensures that embedded documents are transparently decrypted after a parent the parent is persisted
 *
 * For use in conjunction with the main encryption plugin.
 */

module.exports = function(schema) {
    schema.post('save', function(doc) {
    	doc._decryptEmbeddedDocs();
    });
    schema.post('validate', function(doc) {
        if (doc.errors) {
            doc._decryptEmbeddedDocs();
        }
    });
};
