/**
 * Sets the value of a field.
 *
 * @param      {Object}  obj     The object
 * @param      {string}  field   The path to a field. Can include dots (.)
 * @param      {*}       val     The value to set the field
 * @return     {Object}  The modified object
 */
export function setFieldValue(obj: any, field: string, val: any): any;
/**
 * Pick a subset of fields from an object
 *
 * @param      {Object}   obj      The object
 * @param      {string[]} fields   The fields to pick. Can include dots (.)
 * @param      {Object}   [options]  The options
 * @param      {boolean}  [options.excludeUndefinedValues=false]  Whether undefined values should be included in returned object.
 * @return     {Object}   An object containing only those fields that have been picked
 */
export function pick(obj: any, fields: string[], options?: {
    excludeUndefinedValues: boolean;
}): any;
/**
 * Determines if embedded document.
 *
 * @param      {Model}    doc     The Mongoose document
 * @return     {boolean}  True if embedded document, False otherwise.
 */
export function isEmbeddedDocument(doc: any): boolean;
