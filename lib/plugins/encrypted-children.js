'use strict';

var mongoose = require('mongoose');

/**
 * Export For Schemas That Contain Encrypted Embedded Documents
 *
 * This ensures that if parent has a validation error, children don't come out encrypted,
 * which could otherwise cause data loss if validation error fixed and a resave was attempted
 * For use in conjunction with the main encryption plugin.
 */

module.exports = function(schema) {
    if (mongoose.version > '4.1.0') {
        console.warn('encryptedChildren plugin is not needed for mongoose versions above 4.1.1, continuing without plugin.');
        return;
    }

    schema.post('validate', function(doc) {
        if (doc.errors) {
            doc._decryptEmbeddedDocs();
        }
    });
};
