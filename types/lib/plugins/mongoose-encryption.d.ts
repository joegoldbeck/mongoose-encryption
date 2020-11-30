export = mongooseEncryption;
/**
 * Mongoose encryption plugin
 * @module mongoose-encryption
 *
 *
 * @param      {Object}     schema   The schema
 * @param      {Object}     options  Plugin options
 * @param      {string}     [options.secret]  A secret string which will be used to generate an encryption key and a signing key
 * @param      {string}     [options.encryptionKey]  A secret string which will be used to generate an encryption key
 * @param      {string}     [options.signingKey]  A secret string which will be used to generate a signing key
 * @param      {string[]}   [options.encryptedFields]  A list of fields to encrypt. Default is to encrypt all fields.
 * @param      {string[]}   [options.excludeFromEncryption]  A list of fields to not encrypt
 * @param      {string[]}   [options.additionalAuthenticatedFields]  A list of fields to authenticate even if they aren't encrypted
 * @param      {boolean}    [options.requireAuthenticationCode=true]  Whether documents without an authentication code are valid
 * @param      {boolean}    [options.decryptPostSave=true]  Whether to automatically decrypt documents in the application after saving them (faster if false)
 * @param      {string}     [options.collectionId]  If you update the Model name of the schema, this should be set to its original name
 * @return     {undefined}
 */
declare function mongooseEncryption(schema: any, options: {
    secret: string;
    encryptionKey: string;
    signingKey: string;
    encryptedFields: string[];
    excludeFromEncryption: string[];
    additionalAuthenticatedFields: string[];
    requireAuthenticationCode: boolean;
    decryptPostSave: boolean;
    collectionId: string;
}): undefined;
declare namespace mongooseEncryption {
    export { AAC_LENGTH, VERSION_LENGTH };
}
declare var AAC_LENGTH: number;
declare var VERSION_LENGTH: number;
