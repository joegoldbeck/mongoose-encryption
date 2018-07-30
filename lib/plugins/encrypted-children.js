'use strict';

var mongoose = require('mongoose');
var dotty = require('dotty');
var _ = require('underscore');

var objectUtil = require('../util/object-util.js');
var cryptoUtil = require('../util/crypto-util.js');

var isEmbeddedDocument = objectUtil.isEmbeddedDocument;

/**
 * Export For Schemas That Contain Encrypted Embedded Documents
 *
 * This ensures that embedded documents are transparently decrypted after the parent is persisted
 *
 * For use in conjunction with the main encryption plugin.
 */

module.exports = function(schema) {
    schema.post('save', function(doc) {
    	// TODO DRY
    	_.keys(schema.paths).forEach(function (path) {
    	    if (path === '_id' || path === '__v') {
    	        return;
    	    }

    	    var nestedDoc = dotty.get(doc, path);

    	    if (nestedDoc && nestedDoc[0] && isEmbeddedDocument(nestedDoc[0])) {
    	        nestedDoc.forEach(function (subDoc) {
    	            if (_.isFunction(subDoc.decryptSync)) {
    	                subDoc.decryptSync();
    	            }
    	        });
    	    }
    	});
    });
};
