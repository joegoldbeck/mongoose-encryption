'use strict';

/* eslint-disable no-param-reassign */

const crypto = require('crypto');
const _ = require('underscore');
const mongoose = require('mongoose');
const stableStringify = require('json-stable-stringify');
const bufferEqual = require('buffer-equal-constant-time');
const mpath = require('mpath');
const semver = require('semver');
const { promisify } = require('util');

const { pick, setFieldValue, isEmbeddedDocument } = require('../util/object-util.js');
const { drop256, deriveKey } = require('../util/crypto-util.js');
const decryptEmbeddedDocs = require('../util/decryptEmbeddedDocs.js');

const randomBytes = promisify(crypto.randomBytes);

/**  Plugin Constants */

const VERSION = 'a';

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const AAC_LENGTH = 32;
const VERSION_LENGTH = 1;
const VERSION_BUF = Buffer.from(VERSION);

if (semver.lt(mongoose.version, '5.0.0')) {
  throw new Error('Mongoose version 5.0.0 or greater is required');
}

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

const mongooseEncryption = function mongooseEncryption(
  schema,
  {
    secret,
    encryptionKey,
    signingKey,
    encryptedFields,
    excludeFromEncryption,
    additionalAuthenticatedFields,
    requireAuthenticationCode = true, // allow for no authentication code on docs (not recommended),
    decryptPostSave = true, // allow for skipping the decryption after save for improved performance
    collectionId,
    middleware = true, // allow for skipping middleware with false
    fields: deprecatedFieldsOption, // deprecated
    exclude: deprecatedExcludeOption, // deprecated
    _suppressDuplicatePluginError = false // used for testing only
  }
) {
  /** Encryption Keys */
  if (secret) {
    if (encryptionKey || signingKey) {
      throw new Error('if secret is used, then encryptionKey and signingKey must not be included');
    } else {
      encryptionKey = drop256(deriveKey(secret, 'enc'));
      signingKey = deriveKey(secret, 'sig');
    }
  } else if (!encryptionKey || !signingKey) {
    throw new Error('must provide either secret or both encryptionKey and signingKey');
  } else {
    encryptionKey = Buffer.from(encryptionKey, 'base64');
    if (encryptionKey.length !== 32) {
      throw new Error('encryptionKey must be a a 32 byte base64 string');
    }
    signingKey = Buffer.from(signingKey, 'base64');
    if (signingKey.length !== 64) {
      throw new Error('options.signingKey must be a a 64 byte base64 string');
    }
  }

  /** Deprecated options */

  if (deprecatedFieldsOption) {
    encryptedFields = deprecatedFieldsOption;
    console.warn("the 'fields' option has been deprecated. please use 'encryptedFields'");
  }
  if (deprecatedExcludeOption) {
    excludeFromEncryption = deprecatedExcludeOption;
    console.warn("the 'exclude' option has been deprecated. please use 'excludeFromEncryption'");
  }

  /** Encryption Options */

  if (encryptedFields) {
    encryptedFields = _.difference(encryptedFields, ['_ct']);
  } else {
    const excludedFields = _.union(['_id', '_ct'], excludeFromEncryption);
    encryptedFields = _
      .chain(schema.paths)
      .filter(pathDetails => !pathDetails._index) // exclude indexed fields
      .pluck('path') // get path name
      .difference(excludedFields) // exclude excluded fields
      .uniq()
      .value();
  }

  /** Authentication Options */

  const baselineAuthenticateFields = ['_id', '_ct'];

  let authenticatedFields;
  if (additionalAuthenticatedFields) {
    authenticatedFields = _.union(additionalAuthenticatedFields, baselineAuthenticateFields);
  } else {
    authenticatedFields = baselineAuthenticateFields;
  }

  /** Augment Schema */

  if (!schema.paths._ct) {
    // ciphertext
    schema.add({
      _ct: {
        type: Buffer
      }
    });
  }
  if (!schema.paths._ac) {
    // authentication code
    schema.add({
      _ac: {
        type: Buffer
      }
    });
  }

  /** Authentication Functions */

  function computeAC(doc, fields, version, modelName) {
    // HMAC-SHA512-drop-256
    const hmac = crypto.createHmac('sha512', signingKey);

    if (!(fields instanceof Array)) {
      throw new Error('fields must be an array');
    }
    if (fields.indexOf('_id') === -1) {
      throw new Error('_id must be in array of fields to authenticate');
    }
    if (fields.indexOf('_ac') !== -1) {
      throw new Error('_ac cannot be in array of fields to authenticate');
    }

    const documentCollectionId = collectionId || modelName || doc.constructor.modelName;

    if (!documentCollectionId) {
      throw new Error(
        'For authentication, each collection must have a unique id. This is normally the model name when there is one, but can be overridden or added by collectionId'
      );
    }

    // convert to regular object if possible in order to convert to the eventual mongo form which may be different than mongoose form
    // and only pick fields that will be authenticated
    const objectToAuthenticate = pick(doc.toObject ? doc.toObject() : doc, fields);
    const stringToAuthenticate = stableStringify(objectToAuthenticate);
    hmac.update(documentCollectionId);
    hmac.update(version);
    hmac.update(stringToAuthenticate);
    hmac.update(JSON.stringify(fields));
    const fullAuthenticationBuffer = Buffer.from(hmac.digest());
    return drop256(fullAuthenticationBuffer);
  }

  /** Functions To Check If Authenticated Fields Were Selected By Query */

  const authenticationFieldsToCheck = _
    .chain(authenticatedFields)
    .union(['_ac'])
    .without('_id')
    .value(); // _id is implicitly selected

  const authenticatedFieldsIsSelected = doc =>
    _.map(authenticationFieldsToCheck, field => doc.isSelected(field));

  const allAuthenticationFieldsSelected = doc => {
    const isSelected = authenticatedFieldsIsSelected(doc);
    if (_.uniq(isSelected).length === 1) {
      return isSelected[0];
    }
    return false;
  };

  const noAuthenticationFieldsSelected = doc => {
    const isSelected = authenticatedFieldsIsSelected(doc);
    if (_.uniq(isSelected).length === 1) {
      return isSelected[0] === false;
    }
    return false;
  };

  /** Ensure plugin only added once per schema */
  if (schema.statics._mongooseEncryptionInstalled) {
    if (!_suppressDuplicatePluginError) {
      throw new Error(
        'Mongoose encryption plugin can only be added once per schema.\n\n' +
          'If you are running migrations, please remove encryption middleware first. ' +
          'Migrations should be run in a script where `encrypt.migrations` is added to the schema, ' +
          'however the standard `encrypt` middleware should not be present at the same time. '
      );
    }
  } else {
    schema.statics._mongooseEncryptionInstalled = true;
  }

  /** Middleware */

  if (middleware) {
    // eslint-disable-next-line consistent-return
    schema.pre('init', function preInit(data) {
      let err = null;
      try {
        // this hook must be synchronous for embedded docs, so everything is synchronous for code simplicity
        if (!isEmbeddedDocument(this)) {
          // don't authenticate embedded docs because there's no way to handle the error appropriately
          if (allAuthenticationFieldsSelected(this)) {
            this.authenticateSync.call(data, this.constructor.modelName);
          } else if (!noAuthenticationFieldsSelected(this)) {
            throw new Error(
              `Authentication failed: Only some authenticated fields were selected by the query. Either all or none of the authenticated fields (${authenticationFieldsToCheck}) should be selected for proper authentication.`
            );
          }
        }
        if (this.isSelected('_ct')) {
          this.decryptSync.call(data);
        }
      } catch (e) {
        err = e;
      }

      if (isEmbeddedDocument(this)) {
        if (err) {
          console.error(err);
          throw err; // note: this won't actually get thrown until save, because errors in subdoc init fns are CastErrors and aren't thrown by validate()
        }
        this._doc = data;
        return this;
      }
      if (err) throw err;
    });

    schema.pre('save', async function preSave() {
      if (this.isNew || this.isSelected('_ct')) {
        await this.encrypt();
        if ((this.isNew || allAuthenticationFieldsSelected(this)) && !isEmbeddedDocument(this)) {
          _.forEach(authenticatedFields, authenticatedField => {
            this.markModified(authenticatedField);
          });

          await this.sign();
        }
        return;
      }
      if (allAuthenticationFieldsSelected(this) && !isEmbeddedDocument(this)) {
        // _ct is not selected but all authenticated fields are. cannot get hit in current version.
        _.forEach(authenticatedFields, authenticatedField => {
          this.markModified(authenticatedField);
        });
        await this.sign();
      }
    });

    if (decryptPostSave) {
      schema.post('save', doc => {
        if (isEmbeddedDocument(doc)) {
          return;
        }

        if (typeof doc.decryptSync === 'function') {
          doc.decryptSync();
        }

        decryptEmbeddedDocs(doc);
      });
    }
  }

  /** Encryption Instance Methods */

  schema.methods.encrypt = async function encrypt() {
    if (this._ct) {
      throw new Error('Encrypt failed: document already contains ciphertext');
    }

    const iv = await randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
    const objectToEncrypt = pick(this, encryptedFields, {
      excludeUndefinedValues: true
    });

    const jsonToEncrypt = JSON.stringify(objectToEncrypt);

    return new Promise(resolve => {
      cipher.end(jsonToEncrypt, 'utf-8', () => {
        // add ciphertext to document
        this._ct = Buffer.concat([VERSION_BUF, iv, cipher.read()]);

        // remove encrypted fields from cleartext
        encryptedFields.forEach(field => {
          setFieldValue(this, field, undefined);
        });
        resolve();
      });
    });
  };

  schema.methods.decrypt = async function decrypt() {
    schema.methods.decryptSync.call(this);
  };

  schema.methods.decryptSync = function decryptSync() {
    if (this._ct) {
      const ctWithIV = Object.prototype.hasOwnProperty.call(this._ct, 'buffer')
        ? this._ct.buffer
        : this._ct;
      const iv = ctWithIV.slice(VERSION_LENGTH, VERSION_LENGTH + IV_LENGTH);
      const ct = ctWithIV.slice(VERSION_LENGTH + IV_LENGTH, ctWithIV.length);

      const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);

      let decryptedObject;
      try {
        const decryptedObjectJSON = decipher.update(ct, undefined, 'utf8') + decipher.final('utf8');
        decryptedObject = JSON.parse(decryptedObjectJSON);
      } catch (err) {
        const idString = this._id ? this._id.toString() : 'unknown';
        throw new Error(`Error parsing JSON during decrypt of ${idString}: ${err}`);
      }

      encryptedFields.forEach(field => {
        const decipheredVal = mpath.get(field, decryptedObject);

        // JSON.parse returns {type: "Buffer", data: Buffer} for Buffers
        // https://nodejs.org/api/buffer.html#buffer_buf_tojson
        if (_.isObject(decipheredVal) && decipheredVal.type === 'Buffer') {
          setFieldValue(this, field, decipheredVal.data);
        } else {
          setFieldValue(this, field, decipheredVal);
        }
      });

      this._ct = undefined;
      this._ac = undefined;
    }
  };

  /** Authentication Instance Methods */

  schema.methods.sign = async function sign() {
    const basicAC = computeAC(this, authenticatedFields, VERSION);
    const authenticatedFieldsBuf = Buffer.from(JSON.stringify(authenticatedFields));
    this._ac = Buffer.concat([VERSION_BUF, basicAC, authenticatedFieldsBuf]);
  };

  schema.methods.authenticate = async function authenticate() {
    schema.methods.authenticateSync.call(this);
  };

  schema.methods.authenticateSync = function authenticateSync(...args) {
    if (!this._ac) {
      if (requireAuthenticationCode) {
        throw new Error('Authentication code missing');
      }
      return;
    }
    const acBuf = Object.prototype.hasOwnProperty.call(this._ac, 'buffer')
      ? this._ac.buffer
      : this._ac;
    if (acBuf.length < VERSION_LENGTH + AAC_LENGTH + 2) {
      throw new Error('_ac is too short and has likely been cut off or modified');
    }
    const versionUsed = acBuf.slice(0, VERSION_LENGTH).toString();
    const basicAC = acBuf.slice(VERSION_LENGTH, VERSION_LENGTH + AAC_LENGTH);
    const authenticatedFieldsUsed = JSON.parse(
      acBuf.slice(VERSION_LENGTH + AAC_LENGTH, acBuf.length).toString()
    );

    const expectedHMAC = computeAC(this, authenticatedFieldsUsed, versionUsed, args[0]); // pass in modelName as argument in init hook

    const authentic = bufferEqual(basicAC, expectedHMAC);
    if (!authentic) {
      throw new Error('Authentication failed');
    }
  };
};

module.exports = mongooseEncryption;

// Exports For Tests //
module.exports.AAC_LENGTH = AAC_LENGTH;
module.exports.VERSION_LENGTH = VERSION_LENGTH;
