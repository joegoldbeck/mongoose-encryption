'use strict';

const mpath = require('mpath');

/**
 * Sets the value of a field.
 *
 * @param      {Object}  obj     The object
 * @param      {string}  field   The path to a field. Can include dots (.)
 * @param      {*}       val     The value to set the field
 * @return     {Object}  The modified object
 */
function setFieldValue(obj, field, val) {
  // using mpath.set() for this would be nice
  // but it does not create new objects as it traverses the path
  const parts = field.split('.');
  const partsLen = parts.length;
  let partRef = obj || {};

  for (let i = 0; i < partsLen; i++) {
    const part = parts[i];

    if (i === partsLen - 1) {
      partRef[part] = val;
    } else {
      partRef[part] = partRef[part] || {};
      partRef = partRef[part];
    }
  }

  return obj;
}

/**
 * Pick a subset of fields from an object
 *
 * @param      {Object}   obj      The object
 * @param      {string[]} fields   The fields to pick. Can include dots (.)
 * @param      {Object}   [options]  The options
 * @param      {boolean}  [options.excludeUndefinedValues=false]  Whether undefined values should be included in returned object.
 * @return     {Object}   An object containing only those fields that have been picked
 */
function pick(obj, fields, { excludeUndefinedValues = false }) {
  const result = {};
  let val;

  fields.forEach(field => {
    val = mpath.get(field, obj);

    if (!excludeUndefinedValues || val !== undefined) {
      setFieldValue(result, field, val);
    }
  });

  return result;
}

/**
 * Determines if embedded document.
 *
 * @param      {Model}    doc     The Mongoose document
 * @return     {boolean}  True if embedded document, False otherwise.
 */
function isEmbeddedDocument(doc) {
  return doc.constructor.name === 'EmbeddedDocument' || doc.constructor.name === 'SingleNested';
}

module.exports = {
  setFieldValue,
  pick,
  isEmbeddedDocument
};
