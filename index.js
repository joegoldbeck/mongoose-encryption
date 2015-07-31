(function() {

  var crypto = require('crypto');
  var _ = require('underscore');
  var mongoose = require('mongoose');
  var semver = require('semver')
  var dotty = require('dotty');

  var ALGORITHM = 'aes-256-cbc';
  var IV_LENGTH = 16;

  var isEmbeddedDocument = function(doc) {
    return doc.constructor.name === 'EmbeddedDocument';
  };

  if(semver.gt(process.version, '4.0.0')){
    if(semver.lt(mongoose.version, '4.2.4')){
      throw new Error('Mongoose version 4.2.4 or greater is required for Node version 4.0.0 or greater');
    }
  }

  module.exports = function(schema, options) {

    var details, encryptedFields, excludedFields, key, path;



    if (!options.key)
      throw new Error('options.key is required as a 32 byte base64 string');

    key = new Buffer(options.key, 'base64');

    if (!schema.paths._ct)
      schema.add({
        _ct: {
          type: Buffer
        }
      });

    if (options.fields)
      encryptedFields = _.difference(options.fields, ['_ct']);
    else {
      excludedFields = _.union(['_id', '_ct'], options.exclude);
      encryptedFields = [];
      for (path in schema.paths) {
        details = schema.paths[path];
        if (excludedFields.indexOf(path) < 0 && !details._index) {
          encryptedFields.push(path);
        }
      }
    }

    schema.pre('init', function(next, data) {
      if (isEmbeddedDocument(this)) {
        this.decryptSync.call(data);
        this._doc = data;
        return this; // must return updated doc synchronously for EmbeddedDocuments
      } else {
        this.decrypt.call(data, function(err){
          if (err)
            throw new Error(err); // throw because passing the error to next() in this hook causes it to get swallowed
          next();
        });
      }
    });

    schema.pre('save', function(next) {
      if (this.isNew || this.isSelected('_ct'))
        this.encrypt(next);
      else
        next();
    });

    decryptEmbeddedDocs = function(doc) {
      _.keys(doc.schema.paths).forEach(function(path) {
        if (path === '_id' || path === '__v') return;

        var nestedDoc = dotty.get(doc, path);

        if (nestedDoc && nestedDoc[0] && isEmbeddedDocument(nestedDoc[0])) {
          nestedDoc.forEach(function(subDoc) {
            if (_.isFunction(subDoc.decryptSync)) subDoc.decryptSync();
          });
        }
      });
    }

    schema.post('save', function(doc) {
      if (_.isFunction(doc.decryptSync)) doc.decryptSync();

      // Until 3.8.6, Mongoose didn't trigger post save hook on EmbeddedDocuments,
      // instead had to call decrypt on all subDocs.
      // ref https://github.com/LearnBoost/mongoose/issues/915

      decryptEmbeddedDocs(doc);

      return doc;
    });

    schema.methods.encrypt = function(cb) {
      var that = this;
      // generate random iv
      crypto.randomBytes(IV_LENGTH, function(err, iv) {
        var cipher, field, jsonToEncrypt, objectToEncrypt, val;
        if (err) {
          return cb(err);
        }
        cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        objectToEncrypt = _.pick(that, encryptedFields);
        for (field in objectToEncrypt) {
          val = objectToEncrypt[field];
          if (val === undefined) {
            delete objectToEncrypt[field];
          } else {
            that[field] = undefined;
          }
        }
        jsonToEncrypt = JSON.stringify(objectToEncrypt);
        cipher.end(jsonToEncrypt, 'utf-8', function() {
          that._ct = Buffer.concat([iv, cipher.read()]);
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
      var ct, ctWithIV, decipher, iv;
      if (this._ct) {
        ctWithIV = this._ct.hasOwnProperty('buffer') ? this._ct.buffer : this._ct;
        iv = ctWithIV.slice(0, IV_LENGTH);
        ct = ctWithIV.slice(IV_LENGTH, ctWithIV.length);
        decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decryptedObjectJSON = decipher.update(ct, undefined, 'utf8') + decipher.final('utf8');
        try {
          decryptedObject = JSON.parse(decryptedObjectJSON);
        } catch (err) {
          if (this._id)
            idString = this._id.toString();
          else
            idString = 'unknown';
          throw new Error('Error parsing JSON during decrypt of ' + idString + ': ' + err);
        }
        for (field in decryptedObject) {
          decipheredVal = decryptedObject[field];
          //JSON.parse returns {type: "Buffer", data: Buffer} for Buffers
          //https://nodejs.org/api/buffer.html#buffer_buf_tojson
          if(_.isObject(decipheredVal) && decipheredVal.type === "Buffer"){
            this[field] = decipheredVal.data;
          }else {
            this[field] = decipheredVal;
          }
        }
        this._ct = undefined;
      }
    };
  };

  // applied to schemas that contain encrypted embedded documents
  // this ensures that if parent has a validation error, children don't come out encrypted,
  // which could otherwise cause data loss if validation error fixed and a resave was attempted
  module.exports.encryptedChildren = function(schema, options) {
    if (mongoose.version > '4.1.0') {
      console.warn('encryptedChildren plugin is not needed for mongoose versions above 4.1.1, continuing without plugin.');
      return;
    }

    schema.post('validate', function(doc) {
      if (doc.errors) {
        decryptEmbeddedDocs(doc);
      }
    });
  }

}).call(this);
