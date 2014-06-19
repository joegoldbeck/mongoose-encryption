(function() {

  var crypto = require('crypto');
  var _ = require('underscore');

  var algorithm = 'aes-256-cbc';

  module.exports = function(schema, options) {

    var details, encryptedFields, excludedFields, key, path;

    if (!options.key)
      throw new Error('options.key is required as a 32 byte string');

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
      this.decrypt.call(data, next);
    });

    schema.pre('save', function(next) {
      if (this.isNew || this.isSelected('_ct'))
        this.encrypt(next);
      else
        next();
    });

    schema.methods.encrypt = function(cb) {
      var that = this;
      crypto.randomBytes(16, function(err, iv) {
        var cipher, field, jsonToEncrypt, objectToEncrypt, val;
        if (err) {
          return cb(err);
        }
        cipher = crypto.createCipheriv(algorithm, key, iv);
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

    schema.methods.decrypt = function(cb) {
      var ct, ctWithIV, decipher, iv;
      var that = this;
      if (this._ct) {
        ctWithIV = this._ct.buffer || this._ct;
        iv = ctWithIV.slice(0, 16);
        ct = ctWithIV.slice(16, ctWithIV.length);
        decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.end(ct, function() {
          var decipheredVal, err, field, unencryptedObject, _ref1;
          decipher.setEncoding('utf-8');
          try {
            unencryptedObject = JSON.parse(decipher.read());
          } catch (err) {
            if (that._id)
              idString = that._id.toString()
            else
              idString = 'unknown'
            return cb('Error parsing JSON during decrypt of ' + idString + ': ' + err);
          }
          for (field in unencryptedObject) {
            decipheredVal = unencryptedObject[field];
            that[field] = decipheredVal;
          }
          that._ct = undefined;
          return cb(null);
        });
      } else {
        cb(null);
      }
    };
  };

}).call(this);
