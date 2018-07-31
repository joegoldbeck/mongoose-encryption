"use strict";

const mongooseEncryption = require("./mongoose-encryption.js");

const VERSION_A_BUF = Buffer.from("a");

/**
 * Export For Migrations
 *
 * Should not be used in conjunction with the main encryption plugin.
 */

module.exports = function migrations(schema, options) {
  // get all instance methods
  // don't run middleware during the migration
  mongooseEncryption(schema, Object.assign({}, options, { middleware: false }));

  // eslint-disable-next-line no-param-reassign
  schema.statics.migrateToA = async function migrateToA() {
    const docs = await this.find({});
    return Promise.all(
      docs.map(async doc => {
        // if already migrated, don't migrate
        if (doc._ac) {
          return;
        }
        // if previously encrypted
        if (doc._ct) {
          // append version to ciphertext
          doc._ct = Buffer.concat([VERSION_A_BUF, doc._ct]); // eslint-disable-line no-param-reassign
          await doc.sign();
          await doc.save();
          return;
        }

        // if not previously encrypted
        await doc.encrypt();
        await doc.sign();
        await doc.save();
      })
    );
  };

  schema.statics.migrateSubDocsToA = async function migrateSubDocsToA( // eslint-disable-line no-param-reassign
    subDocField
  ) {
    if (typeof subDocField !== "string") {
      throw new Error(
        "First argument must be the name of a field in which subdocuments are stored"
      );
    }
    const docs = await this.find({});
    return Promise.all(
      docs.map(async doc => {
        if (doc[subDocField]) {
          doc[subDocField].forEach(subDoc => {
            // for each subdoc
            // if previously encrypted
            if (subDoc._ct) {
              // append version to ciphertext
              subDoc._ct = Buffer.concat([VERSION_A_BUF, subDoc._ct]); // eslint-disable-line no-param-reassign
            }
          });
          await doc.save(); // save
        }
      })
    );
  };

  // sign all the documents in a collection
  // eslint-disable-next-line no-param-reassign
  schema.statics.signAll = async function signAll() {
    const docs = await this.find({});
    return Promise.all(
      docs.map(async doc => {
        await doc.sign();
        return doc.save();
      })
    );
  };
};
