'use strict';

var _ = require('underscore');
var mongooseEncryption = require('./mongoose-encryption.js');

var VERSION_A_BUF = Buffer.from('a');

/**
 * Export For Migrations
 *
 * Should not be used in conjunction with the main encryption plugin.
 *
 * Each static accepts an optional trailing callback for backwards compatibility and returns a
 * Promise when the callback is omitted. Internally everything is promise-based because
 * Mongoose 7 removed callback support from Model.find() and Document.save().
 */

var withOptionalCallback = function(promise, cb) {
    if (typeof cb !== 'function') {
        return promise;
    }
    promise.then(function() { cb(); }, cb);
};

module.exports = function(schema, options) {
    options.middleware = false; // don't run middleware during the migration
    mongooseEncryption(schema, options); // get all instance methods

    schema.statics.migrateToA = function(cb) {
        var Model = this;
        return withOptionalCallback((async function() {
            var docs = await Model.find({}); // find all docs in collection
            await Promise.all(docs.map(async function(doc) { // for each doc
                if (doc._ac) { // don't migrate if already migrated
                    return;
                }
                if (doc._ct) { // if previously encrypted
                    doc._ct = Buffer.concat([VERSION_A_BUF, doc._ct]); // append version to ciphertext
                } else { // if not previously encrypted
                    await doc.encrypt();
                }
                await doc.sign();
                await doc.save();
            }));
        })(), cb);
    };

    schema.statics.migrateSubDocsToA = function(subDocField, cb) {
        var Model = this;
        return withOptionalCallback((async function() {
            if (typeof subDocField !== 'string'){
                throw new Error('First argument must be the name of a field in which subdocuments are stored');
            }
            var docs = await Model.find({}); // find all docs in collection
            await Promise.all(docs.map(async function(doc) { // for each doc
                if (!doc[subDocField]) {
                    return;
                }
                _.each(doc[subDocField], function(subDoc){ // for each subdoc
                    if (subDoc._ct) { // if previously encrypted
                        subDoc._ct = Buffer.concat([VERSION_A_BUF, subDoc._ct]); // append version to ciphertext
                    }
                });
                await doc.save();
            }));
        })(), cb);
    };

    // sign all the documents in a collection
    schema.statics.signAll = function(cb) {
        var Model = this;
        return withOptionalCallback((async function() {
            var docs = await Model.find({}); // find all docs in collection
            await Promise.all(docs.map(async function(doc) { // for each doc
                await doc.sign();
                await doc.save();
            }));
        })(), cb);
    };
};
