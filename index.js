'use strict';
(function () {

  var crypto = require('crypto');
  var _ = require('underscore');
  var mongoose = require('mongoose');
  var ObjectId = mongoose.Types.ObjectId;
  var stableStringify = require('json-stable-stringify');
  var async = require('async');
  var dotty = require('dotty');
  var bufferEqual = require('buffer-equal-constant-time');


  // Constants //

  var ENCRYPTION_ALGORITHM = 'aes-256-cbc';
  var IV_LENGTH = 16;
  var AAC_LENGTH = 32;

  var VERSION_LENGTH = 1;

  var VERSION = 'a';
  var VERSION_BUF = new Buffer(VERSION);


  // Utility Functions //

  var isEmbeddedDocument = function (doc) {
    return doc.constructor.name === 'EmbeddedDocument';
  };

  var deriveKey = function (master, type) {
    var hmac = crypto.createHmac('sha512', master);
    hmac.update(type);
    return new Buffer(hmac.digest());
  };

  var clearBuffer = function (buf) {
    for (var i = 0; i < buf.length; i++) {
      buf[i] = 0;
    }
  };

  var drop256 = function (buf) {
    var buf256 = new Buffer(32);
    buf.copy(buf256, 0, 0, 32);
    clearBuffer(buf);
    return buf256;
  };


  var decryptEmbeddedDocs = function(doc) {
    _.keys(doc.schema.paths).forEach(function(path) {
      if (path === '_id' || path === '__v') {
        return;
      }

      var nestedDoc = dotty.get(doc, path);

      if (nestedDoc && nestedDoc[0] && isEmbeddedDocument(nestedDoc[0])) {
        nestedDoc.forEach(function(subDoc) {
          if (_.isFunction(subDoc.decryptSync)){
            subDoc.decryptSync();
          }
        });
      }
    });
  };


  // Exported Plugin //

  var mongoosePlugin = module.exports = function(schema, options) {
    var details, encryptedFields, excludedFields, authenticatedFields, encryptionKey, signingKey, path;

    _.defaults(options, {
      middleware: true, // allow for skipping middleware with false
      requireAuthenticationCode: true, // allow for no authentication code on docs (not recommended),
      decryptPostSave: true // allow for skipping the decryption after save for improved performance
    });

    // Encryption Keys //

    if (options.secret) {
      if (options.encryptionKey || options.signingKey) {
        throw new Error('if options.secret is used, then options.encryptionKey and options.signingKey must not be included');
      } else {
        encryptionKey = drop256(deriveKey(options.secret, 'enc'));
        signingKey = deriveKey(options.secret, 'sig');
      }
    } else {
      if (!options.encryptionKey || !options.signingKey) {
        throw new Error('must provide either options.secret or both options.encryptionKey and options.signingKey');
      } else {
        encryptionKey = new Buffer(options.encryptionKey, 'base64');
        if (encryptionKey.length !== 32) {
          throw new Error('options.encryptionKey must be a a 32 byte base64 string');
        }
        signingKey = new Buffer(options.signingKey, 'base64');
        if (signingKey.length !== 64) {
          throw new Error('options.signingKey must be a a 64 byte base64 string');
        }
      }
    }


    // Deprecated options

    if (options.fields) {
      options.encryptedFields = options.fields;
      console.warn('options.fields has been deprecated. please use options.encryptedFields');
    }
    if (options.exclude) {
      options.excludeFromEncryption = options.exclude;
      console.warn('options.fields has been deprecated. please use options.excludeFromEncryption');
    }


    // Check no disallowed characters used in options

    var fieldsUsedInOptions = _.compact(_.union(
        options.encryptedFields,
        options.excludeFromEncryption,
        options.additionalAuthenticatedFields
      ));

    if (_.any(fieldsUsedInOptions, function(field){ return field.indexOf('.') !== -1 })) {
      throw new Error("Field names containing '.' are not currently supported")
    }


    // Encryption Options //

    if (options.encryptedFields) {
      encryptedFields = _.difference(options.encryptedFields, ['_ct']);
    } else {
      excludedFields = _.union(['_id', '_ct'], options.excludeFromEncryption);
      encryptedFields = _.chain(schema.paths)
        .filter(function(pathDetails) { // exclude indexed fields
          return !pathDetails._index })
        .pluck('path') // get path name
        .difference(excludedFields) // exclude excluded fields
        .map(function(path) { // get the top level field
          return path.split('.')[0]
        })
        .uniq()
        .value()
    }


    // Authentication Options //

    var baselineAuthenticateFields = ['_id', '_ct'];

    if (options.additionalAuthenticatedFields) {
      authenticatedFields = _.union(options.additionalAuthenticatedFields, baselineAuthenticateFields);
    } else {
      authenticatedFields = baselineAuthenticateFields;
    }




    // Augment Schema //

    if (!schema.paths._ct) { // ciphertext
      schema.add({
        _ct: {
          type: Buffer
        }
      });
    }
    if (!schema.paths._ac) { // authentication code
      schema.add({
        _ac: {
          type: Buffer
        }
      });
    }



    // Authentication Helper Functions //

    var computeAC = function(doc, fields, version, modelName) {
      // HMAC-SHA512-drop-256
      var hmac = crypto.createHmac('sha512', signingKey);

      if (!(fields instanceof Array)){
        throw new Error('fields must be an array');
      }
      if (fields.indexOf('_id') === -1) {
        throw new Error('_id must be in array of fields to authenticate');
      }
      if (fields.indexOf('_ac') !== -1) {
        throw new Error('_ac cannot be in array of fields to authenticate');
      }

      var collectionId = options.collectionId || modelName || doc.constructor.modelName;

      if (!collectionId) {
        throw new Error('For authentication, each collection must have a unique id. This is normally the model name when there is one, but can be overridden or added by options.collectionId');
      }

      // convert to regular object if possible in order to convert to the eventual mongo form which may be different than mongoose form
      // and only pick fields that will be authenticated
      var objectToAuthenticate = _.pick((doc.toObject ? doc.toObject() : doc), fields);
      var stringToAuthenticate = stableStringify(objectToAuthenticate);
      hmac.update(collectionId);
      hmac.update(version);
      hmac.update(stringToAuthenticate);
      hmac.update(JSON.stringify(fields));
      var fullAuthenticationBuffer = new Buffer(hmac.digest());
      return drop256(fullAuthenticationBuffer);
    };

    // Functions To Check If Authenticated Fields Were Selected By Query //

    var authenticationFieldsToCheck = _.chain(authenticatedFields).union(['_ac']).without('_id').value(); // _id is implicitly selected

    var authenticatedFieldsIsSelected = function(doc){
      return _.map(authenticationFieldsToCheck, function(field) {return doc.isSelected(field);});
    };

    var allAuthenticationFieldsSelected = function(doc){
      var isSelected = authenticatedFieldsIsSelected(doc);
      if (_.uniq(isSelected).length === 1){
        return isSelected[0];
      } else {
        return false;
      }
    };

    var noAuthenticationFieldsSelected = function(doc){
      var isSelected = authenticatedFieldsIsSelected(doc);
      if (_.uniq(isSelected).length === 1){
        return isSelected[0] === false;
      } else {
        return false;
      }
    };


    // Middleware //

    if (options.middleware) { // defaults to true
      schema.pre('init', function(next, data) {
          var err = null;
          try { // this hook must be synchronous for embedded docs, so everything is synchronous for code simplicity
            if (!isEmbeddedDocument(this)){ // don't authenticate embedded docs because there's no way to handle the error appropriately
              if (allAuthenticationFieldsSelected(this)) {
                this.authenticateSync.call(data, this.constructor.modelName);
              } else {
                if (!noAuthenticationFieldsSelected(this)){
                  throw new Error("Authentication failed: Only some authenticated fields were selected by the query. Either all or none of the authenticated fields (" + authenticationFieldsToCheck + ") should be selected for proper authentication.");
                }
              }
            }
            if (this.isSelected('_ct')){
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
          } else {
            return next(err);
          }
      });

      schema.pre('save', function(next) {
        if (this.isNew || this.isSelected('_ct') ){
          var that = this;
          that.encrypt(function(err){
            if (err) {
              next(err);
            } else {
              if ((that.isNew || allAuthenticationFieldsSelected(that)) && !isEmbeddedDocument(that)) {
                that.sign(next);
              } else {
                next();
              }
            }
          });
        } else if (allAuthenticationFieldsSelected(this) && !isEmbeddedDocument(this)) { // _ct is not selected but all authenticated fields are. cannot get hit in current version.
          this.sign(next);
        } else {
          next();
        }
      });


      if (options.decryptPostSave) { // true by default
        schema.post('save', function(doc) {
          if (_.isFunction(doc.decryptSync)) {
            doc.decryptSync();
          }

          // Until 3.8.6, Mongoose didn't trigger post save hook on EmbeddedDocuments,
          // instead had to call decrypt on all subDocs.
          // ref https://github.com/LearnBoost/mongoose/issues/915

          decryptEmbeddedDocs(doc);

          return doc;
        });
      }
    }



    // Encryption Instance Methods //

    schema.methods.encrypt = function(cb) {
      var that = this;
      // generate random iv
      crypto.randomBytes(IV_LENGTH, function(err, iv) {
        var cipher, field, jsonToEncrypt, objectToEncrypt, val;
        if (err) {
          return cb(err);
        }
        cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
        objectToEncrypt = _.pick(that, encryptedFields);

        // only encrypt fields that are defined
        for (field in objectToEncrypt) {
          val = objectToEncrypt[field];
          if (val === undefined) {
            delete objectToEncrypt[field];
          }
        }
        jsonToEncrypt = JSON.stringify(objectToEncrypt);

        cipher.end(jsonToEncrypt, 'utf-8', function() {
          // add ciphertext to document
          that._ct = Buffer.concat([VERSION_BUF, iv, cipher.read()]);

          // remove encrypted fields from cleartext
          encryptedFields.forEach(function(field){
            that[field] = undefined;
          });

          cb(null);
        });
      });
    };

    schema.methods.decrypt = function(cb) { // callback style but actually synchronous to allow for decryptSync without copypasta or complication
      try {
        schema.methods.decryptSync.call(this);
      } catch(e){
        return cb(e);
      }
      cb();
    };

    schema.methods.decryptSync = function() {
      var ct, ctWithIV, decipher, iv, idString, decryptedObject, decryptedObjectJSON, decipheredVal;
      if (this._ct) {
        ctWithIV = this._ct.buffer || this._ct;
        iv = ctWithIV.slice(VERSION_LENGTH, VERSION_LENGTH + IV_LENGTH);
        ct = ctWithIV.slice(VERSION_LENGTH + IV_LENGTH, ctWithIV.length);
        decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
        try {
          decryptedObjectJSON = decipher.update(ct, undefined, 'utf8') + decipher.final('utf8');
          decryptedObject = JSON.parse(decryptedObjectJSON);
        } catch (err) {
          if (this._id) {
            idString = this._id.toString();
          } else {
            idString = 'unknown';
          }
          throw new Error('Error parsing JSON during decrypt of ' + idString + ': ' + err);
        }
        for (var field in decryptedObject) {
          decipheredVal = decryptedObject[field];
          this[field] = decipheredVal;
        }
        this._ct = undefined;
      }
    };




    // Authentication Instance Methods //

    schema.methods.sign = function(cb) {
      var basicAC = computeAC(this, authenticatedFields, VERSION);
      var authenticatedFieldsBuf = new Buffer(JSON.stringify(authenticatedFields));
      this._ac = Buffer.concat([VERSION_BUF, basicAC, authenticatedFieldsBuf]);
      cb();
    };

    schema.methods.authenticate = function(cb) { // callback style but actually synchronous to allow for decryptSync without copypasta or complication
      try {
        schema.methods.authenticateSync.call(this);
      } catch(e){
        return cb(e);
      }
      cb();
    };

    schema.methods.authenticateSync = function() {
      if (!this._ac) {
        if (options.requireAuthenticationCode) {
          throw new Error('Authentication code missing');
        } else {
          return null;
        }
      }
      var acBuf = this._ac.buffer || this._ac;
      if (acBuf.length < VERSION_LENGTH + AAC_LENGTH + 2) {
        throw new Error('_ac is too short and has likely been cut off or modified');
      }
      var versionUsed = acBuf.slice(0, VERSION_LENGTH).toString();
      var basicAC = acBuf.slice(VERSION_LENGTH, VERSION_LENGTH + AAC_LENGTH);
      var authenticatedFieldsUsed = JSON.parse(acBuf.slice(VERSION_LENGTH + AAC_LENGTH, acBuf.length).toString());

      var expectedHMAC = computeAC(this, authenticatedFieldsUsed, versionUsed, arguments[0]); // pass in modelName as argument in init hook

      var authentic = bufferEqual(basicAC, expectedHMAC);
      if (authentic){
        this._ac = undefined;
        return null;
      } else {
        throw new Error('Authentication failed');
      }
    };
  };


  // Exports For Schemas That Contain Encrypted Embedded Documents

  // this ensures that if parent has a validation error, children don't come out encrypted,
  // which could otherwise cause data loss if validation error fixed and a resave was attempted
  // For use in conjunction with the main encryption plugin
  module.exports.encryptedChildren = function(schema, options) {
    schema.post('validate', function(doc) {
      if (doc.errors) {
        decryptEmbeddedDocs(doc);
      }
    });
  };

  module.exports.migrations = function(schema, options) {
    options.middleware = false; // don't run middleware during the migration
    mongoosePlugin(schema, options); // get all instance methods

    schema.statics.migrateToA = function(cb) {
      this.find({}, function(err, docs){ // find all docs in collection
        if (err) {
          return cb(err);
        }
        async.each(docs, function(doc, errCb){ // for each doc
          if (doc._ac) { // don't migrate if already migrated
            return errCb();
          }
          if (doc._ct) { // if previously encrypted
            doc._ct = Buffer.concat([VERSION_BUF, doc._ct]); // append version to ciphertext
            doc.sign(function(err){ // sign
              if (err) {
                return errCb(err);
              }
              return doc.save(errCb); // save
            });
          } else { // if not previously encrypted
            doc.encrypt(function(err){ // encrypt
              if (err) {
                return errCb(err);
              }
              doc.sign(function(err){ // sign
                if (err) {
                  return errCb(err);
                }
                return doc.save(errCb); // save
              });
            });
          }
        }, cb);
      });
    };

    schema.statics.migrateSubDocsToA = function(subDocField, cb) {
      if (typeof subDocField !== 'string'){
        cb(new Error('First argument must be the name of a field in which subdocuments are stored'));
      }
      this.find({}, function(err, docs){ // find all docs in collection
        if (err) {
          return cb(err);
        }
        async.each(docs, function(doc, errCb){ // for each doc
          if (doc[subDocField]) {
            _.each(doc[subDocField], function(subDoc){ // for each subdoc
              if (subDoc._ct) { // if previously encrypted
                subDoc._ct = Buffer.concat([VERSION_BUF, subDoc._ct]); // append version to ciphertext
              }
            });
            return doc.save(errCb); // save
          } else {
            errCb()
          }
        }, cb);
      });
    };


    // sign all the documents in a collection
    schema.statics.signAll = function(cb) {
      this.find({}, function(err, docs){ // find all docs in collection
        if (err) {
          return cb(err);
        }
        async.each(docs, function(doc, errCb){ // for each doc
          doc.sign(function(err){ // sign
            if (err) {
              return errCb(err);
            }
            doc.save(errCb); // save
          });
        }, cb);
      });
    };
  };


  // Exports For Tests //
  module.exports.AAC_LENGTH = AAC_LENGTH;
  module.exports.VERSION_LENGTH = VERSION_LENGTH;


}).call(this);
