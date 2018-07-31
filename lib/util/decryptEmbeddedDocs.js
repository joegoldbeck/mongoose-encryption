'use strict';

const dotty = require('dotty');
const _ = require('underscore');

const { isEmbeddedDocument } = require('../util/object-util.js');

/**
 * Synchronously decrypt any embedded documents inside of this document
 * @param  {mongoose document}  document   The mongoose document
 */
module.exports = function decryptEmbeddedDocs(doc) {
  _.keys(doc.schema.paths).forEach(path => {
    if (path === '_id' || path === '__v') {
      return;
    }

    const nestedDoc = dotty.get(doc, path);

    if (nestedDoc && nestedDoc[0] && isEmbeddedDocument(nestedDoc[0])) {
      nestedDoc.forEach(subDoc => {
        if (_.isFunction(subDoc.decryptSync)) {
          subDoc.decryptSync();
        }
      });
    }
  });
};
