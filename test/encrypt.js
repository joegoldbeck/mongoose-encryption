'use strict';

/* eslint-disable func-names, prefer-arrow-callback */

const mongoose = require('mongoose');
const bufferEqual = require('buffer-equal-constant-time');
const sinon = require('sinon');
const chai = require('chai');
const { describe, it, before, beforeEach, after, afterEach } = require('mocha');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const { assert } = chai;

mongoose.connect('mongodb://localhost/mongoose-encryption-test');
const encryptionKey = 'CwBDwGUwoM5YzBmzwWPSI+KjBKvWHaablbrEiDYh43Q=';
const signingKey =
  'dLBm74RU4NW3e2i3QSifZDNXIXBd54yr7mZp0LKugVUa1X1UP9qoxoa3xfA7Ea4kdVL+JsPg9boGfREbPCb+kw==';

const secret = 'correct horse battery staple CtYC/wFXnLQ1Dq8lYZSbnDuz8fTYMALPfgCqdgtpcrc';

const encrypt = require('../index.js');

const BasicEncryptedModelSchema = mongoose.Schema({
  text: {
    type: String
  },
  bool: {
    type: Boolean
  },
  num: {
    type: Number
  },
  date: {
    type: Date
  },
  id2: {
    type: mongoose.Schema.Types.ObjectId
  },
  arr: [
    {
      type: String
    }
  ],
  mix: {
    type: mongoose.Schema.Types.Mixed
  },
  buf: {
    type: Buffer
  },
  idx: {
    type: String,
    index: true
  }
});

BasicEncryptedModelSchema.plugin(encrypt, {
  secret
});

const BasicEncryptedModel = mongoose.model('Simple', BasicEncryptedModelSchema);

describe('encrypt plugin', function() {
  it('should add field _ct of type Buffer to the schema', function() {
    const encryptedSchema = mongoose.Schema({}).plugin(encrypt, {
      encryptionKey,
      signingKey,
      collectionId: 'test'
    });
    assert.property(encryptedSchema.paths, '_ct');
    assert.propertyVal(encryptedSchema.paths._ct, 'instance', 'Buffer');
  });
  it('should add field _ac of type Buffer to the schema', function() {
    const encryptedSchema = mongoose.Schema({}).plugin(encrypt, {
      encryptionKey,
      signingKey,
      collectionId: 'test'
    });
    assert.property(encryptedSchema.paths, '_ac');
    assert.propertyVal(encryptedSchema.paths._ac, 'instance', 'Buffer');
  });
  it('should expose an encrypt method on documents', function() {
    const EncryptFnTestModel = mongoose.model(
      'EncryptFnTest',
      mongoose.Schema({}).plugin(encrypt, {
        encryptionKey,
        signingKey,
        collectionId: 'test'
      })
    );
    assert.isFunction(new EncryptFnTestModel().encrypt);
  });
  it('should expose a decrypt method on documents', function() {
    const DecryptFnTestModel = mongoose.model(
      'DecryptFnTest',
      mongoose.Schema({}).plugin(encrypt, {
        encryptionKey,
        signingKey,
        collectionId: 'test'
      })
    );
    assert.isFunction(new DecryptFnTestModel().decrypt);
  });
  it('should expose a decryptSync method on documents', function() {
    const DecryptSyncFnTestModel = mongoose.model(
      'DecryptSyncFnTest',
      mongoose.Schema({}).plugin(encrypt, {
        encryptionKey,
        signingKey,
        collectionId: 'test'
      })
    );
    assert.isFunction(new DecryptSyncFnTestModel().decryptSync);
  });
  it('should expose a sign method on documents', function() {
    const SignFnTestModel = mongoose.model(
      'SignFnTest',
      mongoose.Schema({}).plugin(encrypt, {
        encryptionKey,
        signingKey,
        collectionId: 'test'
      })
    );
    assert.isFunction(new SignFnTestModel().sign);
  });
  it('should expose a authenticateSync method on documents', function() {
    const AuthenticateSyncFnTestModel = mongoose.model(
      'AuthenticateSyncFnTest',
      mongoose.Schema({}).plugin(encrypt, {
        encryptionKey,
        signingKey,
        collectionId: 'test'
      })
    );
    assert.isFunction(new AuthenticateSyncFnTestModel().authenticateSync);
  });
  it('should throw an error if installed twice on the same schema', function() {
    const EncryptedSchema = mongoose.Schema({
      text: {
        type: String
      }
    });
    EncryptedSchema.plugin(encrypt, {
      secret
    });
    assert.throw(() => {
      EncryptedSchema.plugin(encrypt, {
        secret
      });
    });
  });
});

describe('new EncryptedModel', function() {
  it('should remain unaltered', function() {
    const simpleTestDoc1 = new BasicEncryptedModel({
      text: 'Unencrypted text',
      bool: true,
      num: 42,
      date: new Date('2014-05-19T16:39:07.536Z'),
      id2: '5303e65d34e1e80d7a7ce212',
      arr: ['alpha', 'bravo'],
      mix: {
        str: 'A string',
        bool: false
      },
      buf: Buffer.from('abcdefg')
    });

    assert.propertyVal(simpleTestDoc1, 'text', 'Unencrypted text');
    assert.propertyVal(simpleTestDoc1, 'bool', true);
    assert.propertyVal(simpleTestDoc1, 'num', 42);
    assert.property(simpleTestDoc1, 'date');
    assert.equal(simpleTestDoc1.date.toString(), new Date('2014-05-19T16:39:07.536Z').toString());
    assert.equal(simpleTestDoc1.id2.toString(), '5303e65d34e1e80d7a7ce212');
    assert.lengthOf(simpleTestDoc1.arr, 2);
    assert.equal(simpleTestDoc1.arr[0], 'alpha');
    assert.equal(simpleTestDoc1.arr[1], 'bravo');
    assert.property(simpleTestDoc1, 'mix');
    assert.deepEqual(simpleTestDoc1.mix, {
      str: 'A string',
      bool: false
    });
    assert.property(simpleTestDoc1, 'buf');
    assert.equal(simpleTestDoc1.buf.toString(), 'abcdefg');
    assert.property(simpleTestDoc1, '_id');
    assert.notProperty(simpleTestDoc1.toObject(), '_ct');
  });
});

describe('document.save()', function() {
  before(function() {
    this.sandbox = sinon.sandbox.create();
    this.sandbox.spy(BasicEncryptedModel.prototype, 'sign');
    this.sandbox.spy(BasicEncryptedModel.prototype, 'encrypt');
    this.sandbox.spy(BasicEncryptedModel.prototype, 'decryptSync');
  });
  after(function() {
    this.sandbox.restore();
  });
  beforeEach(async function() {
    BasicEncryptedModel.prototype.sign.reset();
    BasicEncryptedModel.prototype.encrypt.reset();
    BasicEncryptedModel.prototype.decryptSync.reset();
    this.simpleTestDoc2 = new BasicEncryptedModel({
      text: 'Unencrypted text',
      bool: true,
      num: 42,
      date: new Date('2014-05-19T16:39:07.536Z'),
      id2: '5303e65d34e1e80d7a7ce212',
      arr: ['alpha', 'bravo'],
      mix: {
        str: 'A string',
        bool: false
      },
      buf: Buffer.from('abcdefg')
    });
    await this.simpleTestDoc2.save();
  });
  afterEach(async function() {
    await this.simpleTestDoc2.remove();
  });

  it('saves encrypted fields', async function() {
    const docs = await BasicEncryptedModel.find({
      _id: this.simpleTestDoc2._id,
      _ct: {
        $exists: true
      },
      text: {
        $exists: false
      },
      bool: {
        $exists: false
      },
      num: {
        $exists: false
      },
      date: {
        $exists: false
      },
      id2: {
        $exists: false
      },
      arr: {
        $exists: false
      },
      mix: {
        $exists: false
      },
      buf: {
        $exists: false
      }
    });
    assert.lengthOf(docs, 1);
  });

  it('returns decrypted data after save', async function() {
    const doc = await this.simpleTestDoc2.save();
    assert.equal(doc._ct, undefined);
    assert.equal(doc._ac, undefined);
    assert.equal(doc.text, 'Unencrypted text');
    assert.equal(doc.bool, true);
    assert.equal(doc.num, 42);
    assert.deepEqual(doc.date, new Date('2014-05-19T16:39:07.536Z'));
    assert.equal(doc.id2, '5303e65d34e1e80d7a7ce212');
    assert.equal(doc.arr.toString(), ['alpha', 'bravo'].toString());
    assert.deepEqual(doc.mix, {
      str: 'A string',
      bool: false
    });
    assert.deepEqual(doc.buf, Buffer.from('abcdefg'));
  });
  it('should have called encryptSync then authenticateSync then decryptSync', function() {
    assert.equal(this.simpleTestDoc2.sign.callCount, 1);
    assert.equal(this.simpleTestDoc2.encrypt.callCount, 1);
    assert.equal(this.simpleTestDoc2.decryptSync.callCount, 1);
    assert(this.simpleTestDoc2.encrypt.calledBefore(this.simpleTestDoc2.decryptSync));
    assert(
      this.simpleTestDoc2.encrypt.calledBefore(this.simpleTestDoc2.sign, 'encrypted before signed')
    );
    assert(
      this.simpleTestDoc2.sign.calledBefore(
        this.simpleTestDoc2.decryptSync,
        'signed before decrypted'
      )
    );
  });
});

describe('document.save() on encrypted document which contains nesting', function() {
  before(function() {
    this.schemaWithNest = mongoose.Schema({
      nest: {
        birdColor: {
          type: String
        },
        areBirdsPretty: {
          type: Boolean
        }
      }
    });
    this.schemaWithNest.plugin(encrypt, {
      secret
    });
    this.ModelWithNest = mongoose.model('SimpleNest', this.schemaWithNest);
  });
  beforeEach(async function() {
    this.nestTestDoc = new this.ModelWithNest({
      nest: {
        birdColor: 'blue',
        areBirdsPretty: true
      }
    });
    await this.nestTestDoc.save();
  });
  afterEach(async function() {
    await this.nestTestDoc.remove();
  });
  it('encrypts nested fields', async function() {
    const docs = await this.ModelWithNest.find({
      _id: this.nestTestDoc._id,
      _ct: {
        $exists: true
      },
      nest: {
        $exists: false
      }
    }).lean();
    assert.lengthOf(docs, 1);
  });
  it('saves encrypted fields', async function() {
    const docs = await this.ModelWithNest.find({
      _id: this.nestTestDoc._id,
      _ct: {
        $exists: true
      }
    });
    assert.lengthOf(docs, 1);
    assert.isObject(docs[0].nest);
    assert.propertyVal(docs[0].nest, 'birdColor', 'blue');
    assert.propertyVal(docs[0].nest, 'areBirdsPretty', true);
  });
});

describe('document.save() on encrypted nested document', function() {
  before(function() {
    this.schema = mongoose.Schema({
      birdColor: {
        type: String
      },
      areBirdsPretty: {
        type: Boolean
      }
    });
    this.schema.plugin(encrypt, {
      secret,
      collectionId: 'schema',
      encryptedFields: ['birdColor']
    });
    this.schemaWithNest = mongoose.Schema({
      nest: this.schema
    });
    this.ModelWithNest = mongoose.model('SimpleNestedBird', this.schemaWithNest);
  });
  beforeEach(async function() {
    this.nestTestDoc = new this.ModelWithNest({
      nest: {
        birdColor: 'blue',
        areBirdsPretty: true
      }
    });
    await this.nestTestDoc.save();
  });
  afterEach(async function() {
    await this.nestTestDoc.remove();
  });
  it('encrypts nested fields', async function() {
    const docs = await this.ModelWithNest.find({
      _id: this.nestTestDoc._id,
      'nest._ct': {
        $exists: true
      },
      'nest.birdColor': {
        $exists: false
      }
    }).lean();
    assert.lengthOf(docs, 1);
  });
  it('saves encrypted fields', async function() {
    const docs = await this.ModelWithNest.find({
      _id: this.nestTestDoc._id,
      'nest._ct': {
        $exists: true
      }
    });
    assert.lengthOf(docs, 1);
    assert.isObject(docs[0].nest);
    assert.propertyVal(docs[0].nest, 'birdColor', 'blue');
    assert.propertyVal(docs[0].nest, 'areBirdsPretty', true);
  });
});

describe('document.save() when only certain fields are encrypted', function() {
  before(function() {
    const PartiallyEncryptedModelSchema = mongoose.Schema({
      encryptedText: {
        type: String
      },
      unencryptedText: {
        type: String
      }
    });
    PartiallyEncryptedModelSchema.plugin(encrypt, {
      encryptionKey,
      signingKey,
      collectionId: 'PartiallyEncrypted',
      encryptedFields: ['encryptedText']
    });
    this.PartiallyEncryptedModel = mongoose.model(
      'PartiallyEncrypted',
      PartiallyEncryptedModelSchema
    );
  });
  beforeEach(async function() {
    this.partiallyEncryptedDoc = new this.PartiallyEncryptedModel({
      encryptedText: 'Encrypted Text',
      unencryptedText: 'Unencrypted Text'
    });
    this.partiallyEncryptedDoc.save();
  });
  afterEach(async function() {
    this.partiallyEncryptedDoc.remove();
  });
  it('should have decrypted fields', function() {
    assert.equal(this.partiallyEncryptedDoc.encryptedText, 'Encrypted Text');
    assert.propertyVal(this.partiallyEncryptedDoc, 'unencryptedText', 'Unencrypted Text');
  });
  it('should have encrypted fields undefined when encrypt is called', async function() {
    await this.partiallyEncryptedDoc.encrypt();
    assert.equal(this.partiallyEncryptedDoc.encryptedText, undefined);
    assert.propertyVal(this.partiallyEncryptedDoc, 'unencryptedText', 'Unencrypted Text');
  });
  it('should have a field _ct containing a mongoose Buffer object which appears encrypted when encrypted', async function() {
    await this.partiallyEncryptedDoc.encrypt();
    assert.property(this.partiallyEncryptedDoc.toObject()._ct, 'buffer');
    assert.instanceOf(this.partiallyEncryptedDoc.toObject()._ct.buffer, Buffer);
    assert.isString(
      this.partiallyEncryptedDoc.toObject()._ct.toString(),
      'ciphertext can be converted to a string'
    );
    assert.throw(function() {
      return JSON.parse(
        this.partiallyEncryptedDoc.toObject()._ct.toString(),
        'ciphertext is not parsable json'
      );
    });
  });
  it('should not overwrite _ct or _ac when saved after a find that didnt retrieve _ct or _ac', async function() {
    const doc = await this.PartiallyEncryptedModel.findById(this.partiallyEncryptedDoc._id).select(
      'unencryptedText'
    );

    assert.equal(doc._ct, undefined);
    assert.equal(doc._ac, undefined);
    assert.propertyVal(
      doc,
      'unencryptedText',
      'Unencrypted Text',
      'selected unencrypted fields should be found'
    );
    await doc.save();

    const finalDoc = await this.PartiallyEncryptedModel.findById(
      this.partiallyEncryptedDoc._id
    ).select('unencryptedText _ct _ac');

    assert.equal(finalDoc._ct, undefined);
    assert.propertyVal(
      finalDoc,
      'unencryptedText',
      'Unencrypted Text',
      'selected unencrypted fields should still be found after the select -> save'
    );
    assert.propertyVal(
      finalDoc,
      'encryptedText',
      'Encrypted Text',
      'encrypted fields werent overwritten during the select -> save'
    );
  });
});

describe('EncryptedModel.create()', function() {
  beforeEach(function() {
    this.docContents = {
      text: 'Unencrypted text',
      bool: true,
      num: 42,
      date: new Date('2014-05-19T16:39:07.536Z'),
      id2: '5303e65d34e1e80d7a7ce212',
      arr: ['alpha', 'bravo'],
      mix: {
        str: 'A string',
        bool: false
      },
      buf: Buffer.from('abcdefg')
    };
  });
  afterEach(async function() {
    await BasicEncryptedModel.remove();
  });
  it('when doc created, it should pass an unencrypted version to the callback', async function() {
    const doc = await BasicEncryptedModel.create(this.docContents);
    assert.propertyVal(doc, 'text', 'Unencrypted text');
    assert.propertyVal(doc, 'bool', true);
    assert.propertyVal(doc, 'num', 42);
    assert.property(doc, 'date');
    assert.equal(doc.date.toString(), new Date('2014-05-19T16:39:07.536Z').toString());
    assert.equal(doc.id2.toString(), '5303e65d34e1e80d7a7ce212');
    assert.lengthOf(doc.arr, 2);
    assert.equal(doc.arr[0], 'alpha');
    assert.equal(doc.arr[1], 'bravo');
    assert.property(doc, 'mix');
    assert.deepEqual(doc.mix, {
      str: 'A string',
      bool: false
    });
    assert.property(doc, 'buf');
    assert.equal(doc.buf.toString(), 'abcdefg');
    assert.property(doc, '_id');
    assert.notProperty(doc.toObject(), '_ct');
  });
  it('after doc created, should be encrypted in db', async function() {
    const doc = await BasicEncryptedModel.create(this.docContents);
    assert.ok(doc._id);
    const docs = await BasicEncryptedModel.find({
      _id: doc._id,
      _ct: {
        $exists: true
      },
      text: {
        $exists: false
      },
      bool: {
        $exists: false
      },
      num: {
        $exists: false
      },
      date: {
        $exists: false
      },
      id2: {
        $exists: false
      },
      arr: {
        $exists: false
      },
      mix: {
        $exists: false
      },
      buf: {
        $exists: false
      }
    });
    assert.lengthOf(docs, 1);
  });
});

describe('EncryptedModel.find()', function() {
  let simpleTestDoc3 = null;
  before(async function() {
    this.sandbox = sinon.sandbox.create();
    this.sandbox.spy(BasicEncryptedModel.prototype, 'authenticateSync');
    this.sandbox.spy(BasicEncryptedModel.prototype, 'decryptSync');
    simpleTestDoc3 = new BasicEncryptedModel({
      text: 'Unencrypted text',
      bool: true,
      num: 42,
      date: new Date('2014-05-19T16:39:07.536Z'),
      id2: '5303e65d34e1e80d7a7ce212',
      arr: ['alpha', 'bravo'],
      mix: {
        str: 'A string',
        bool: false
      },
      buf: Buffer.from('abcdefg')
    });
    await simpleTestDoc3.save();
  });
  beforeEach(function() {
    BasicEncryptedModel.prototype.authenticateSync.reset();
    BasicEncryptedModel.prototype.decryptSync.reset();
  });
  after(async function() {
    this.sandbox.restore();
    await simpleTestDoc3.remove();
  });
  it('when doc found, should pass an unencrypted version to the callback', async function() {
    const doc = await BasicEncryptedModel.findById(simpleTestDoc3._id);
    assert.propertyVal(doc, 'text', 'Unencrypted text');
    assert.propertyVal(doc, 'bool', true);
    assert.propertyVal(doc, 'num', 42);
    assert.property(doc, 'date');
    assert.equal(doc.date.toString(), new Date('2014-05-19T16:39:07.536Z').toString());
    assert.equal(doc.id2.toString(), '5303e65d34e1e80d7a7ce212');
    assert.lengthOf(doc.arr, 2);
    assert.equal(doc.arr[0], 'alpha');
    assert.equal(doc.arr[1], 'bravo');
    assert.property(doc, 'mix');
    assert.deepEqual(doc.mix, {
      str: 'A string',
      bool: false
    });
    assert.property(doc, 'buf');
    assert.equal(doc.buf.toString(), 'abcdefg');
    assert.property(doc, '_id');
    assert.notProperty(doc.toObject(), '_ct');
  });
  it('when doc not found by id, should pass null to the callback', async function() {
    assert.equal(await BasicEncryptedModel.findById('534ec48d60069bc13338b354', null));
  });
  it('when doc not found by query, should pass [] to the callback', async function() {
    const docs = await BasicEncryptedModel.find({
      text: 'banana'
    });
    assert.isArray(docs);
    assert.lengthOf(docs, 0);
  });
  it('should have called authenticateSync then decryptSync', async function() {
    const doc = await BasicEncryptedModel.findById(simpleTestDoc3._id);
    assert.ok(doc);
    assert.equal(doc.authenticateSync.callCount, 1);
    assert.equal(doc.decryptSync.callCount, 1);
    assert(doc.authenticateSync.calledBefore(doc.decryptSync, 'authenticated before decrypted'));
  });
  it('if all authenticated fields selected, should not throw an error', async function() {
    const doc = await BasicEncryptedModel.findById(simpleTestDoc3._id).select('_ct _ac');
    assert.propertyVal(doc, 'text', 'Unencrypted text');
    assert.propertyVal(doc, 'bool', true);
    assert.propertyVal(doc, 'num', 42);
  });
  it('if only some authenticated fields selected, should throw an error', async function() {
    await assert.isRejected(BasicEncryptedModel.findById(simpleTestDoc3._id).select('_ct'));
    await assert.isRejected(BasicEncryptedModel.findById(simpleTestDoc3._id).select('_ac'));
  });
});

describe('EncryptedModel.find() lean option', function() {
  let simpleTestDoc4 = null;
  before(async function() {
    simpleTestDoc4 = new BasicEncryptedModel({
      text: 'Unencrypted text',
      bool: true,
      num: 42,
      date: new Date('2014-05-19T16:39:07.536Z'),
      id2: '5303e65d34e1e80d7a7ce212',
      arr: ['alpha', 'bravo'],
      mix: {
        str: 'A string',
        bool: false
      },
      buf: Buffer.from('abcdefg')
    });
    await simpleTestDoc4.save();
  });
  after(async function() {
    await simpleTestDoc4.remove();
  });
  it('should have encrypted fields undefined on saved document', async function() {
    const doc = await BasicEncryptedModel.findById(simpleTestDoc4._id).lean();
    assert.equal(doc.text, undefined);
    assert.equal(doc.bool, undefined);
    assert.equal(doc.num, undefined);
    assert.equal(doc.date, undefined);
    assert.equal(doc.id2, undefined);
    assert.equal(doc.arr, undefined);
    assert.equal(doc.mix, undefined);
    assert.equal(doc.buf, undefined);
  });
  it('should have a field _ct containing a mongoose Buffer object which appears encrypted', async function() {
    const doc = await BasicEncryptedModel.findById(simpleTestDoc4._id).lean();
    assert.isObject(doc._ct);
    assert.property(doc._ct, 'buffer');
    assert.instanceOf(doc._ct.buffer, Buffer);
    assert.isString(doc._ct.toString(), 'ciphertext can be converted to a string');
    assert.throw(() => JSON.parse(doc._ct.toString(), 'ciphertext is not parsable json'));
  });
});

describe('document.encrypt()', function() {
  let simpleTestDoc5 = null;
  beforeEach(async function() {
    simpleTestDoc5 = new BasicEncryptedModel({
      text: 'Unencrypted text',
      bool: true,
      num: 42,
      date: new Date('2014-05-19T16:39:07.536Z'),
      id2: '5303e65d34e1e80d7a7ce212',
      arr: ['alpha', 'bravo'],
      mix: {
        str: 'A string',
        bool: false
      },
      buf: Buffer.from('abcdefg'),
      idx: 'Indexed'
    });
    await simpleTestDoc5.encrypt();
  });
  it('should have encrypted fields undefined', function() {
    assert.equal(simpleTestDoc5.text, undefined);
    assert.equal(simpleTestDoc5.bool, undefined);
    assert.equal(simpleTestDoc5.num, undefined);
    assert.equal(simpleTestDoc5.date, undefined);
    assert.equal(simpleTestDoc5.id2, undefined);
    assert.equal(simpleTestDoc5.arr, undefined);
    assert.equal(simpleTestDoc5.mix, undefined);
    assert.equal(simpleTestDoc5.buf, undefined);
  });
  it('should not encrypt indexed fields by default', function() {
    assert.propertyVal(simpleTestDoc5, 'idx', 'Indexed');
  });
  it('should have a field _ct containing a mongoose Buffer object which appears encrypted', function() {
    assert.isObject(simpleTestDoc5._ct);
    assert.property(simpleTestDoc5.toObject()._ct, 'buffer');
    assert.instanceOf(simpleTestDoc5.toObject()._ct.buffer, Buffer);
    assert.isString(
      simpleTestDoc5.toObject()._ct.toString(),
      'ciphertext can be converted to a string'
    );
    assert.throw(() =>
      JSON.parse(simpleTestDoc5.toObject()._ct.toString(), 'ciphertext is not parsable json')
    );
  });
  it('should have non-ascii characters in ciphertext as a result of encryption even if all input is ascii', async function() {
    const allAsciiDoc = new BasicEncryptedModel({
      text: 'Unencrypted text'
    });
    await allAsciiDoc.encrypt();
    assert.notMatch(allAsciiDoc.toObject()._ct.toString(), /^[\x00-\x7F]*$/); // eslint-disable-line no-control-regex
  });
  it('should pass an error when called on a document which is already encrypted', async function() {
    await assert.isRejected(simpleTestDoc5.encrypt());
  });
});

describe('document.decrypt()', function() {
  beforeEach(async function() {
    this.encryptedSimpleTestDoc = new BasicEncryptedModel({
      _id: '584b1e7de752fcf3be8cd086',
      idx: 'Indexed',
      _ct: Buffer.from(
        '610bbddbf35455e9a4fcf2428bb6cd68f39fdaece7e851cb213b1be81b10559d1af6d7c205752d2a6620100871d0e' +
          '95d3609d4ee81795dcc7ef5130b80f117eb12f557a08d4837609f37d24af8d64f8b5072747e1a9e4585fc07d76720' +
          '5e8289235019f818ad7ed9dbb90844d6a42189ab5a8cdc303e60256dbc5daa76386422de8cf1af40ea1c07b7720e5' +
          '3787515a959537f4dffc663c69d29e614621bc7a345ab31f9b8931277d7577962e9558119b9d5d7db0a3b1c298afd' +
          'eabe11581684b62ffaa58a9877d7ceeeb2ea158df3db7881bfedb40ed4d4de7a6465cf1e1148582714279bd0e0cbf' +
          'f145e0bddc1ff3f5e2e6cc8b39f9640e433e4c4140e2095e6',
        'hex'
      )
    });
    this.simpleTestDoc6 = new BasicEncryptedModel({
      text: 'Unencrypted text',
      bool: true,
      num: 42,
      date: new Date('2014-05-19T16:39:07.536Z'),
      id2: '5303e65d34e1e80d7a7ce212',
      arr: ['alpha', 'bravo'],
      mix: {
        str: 'A string',
        bool: false
      },
      buf: Buffer.from('abcdefg'),
      idx: 'Indexed'
    });
    this.simpleTestDoc6.encrypt();
  });
  it('should return an unencrypted version', async function() {
    await this.encryptedSimpleTestDoc.decrypt();
    assert.propertyVal(this.encryptedSimpleTestDoc, 'text', 'Unencrypted text');
    assert.propertyVal(this.encryptedSimpleTestDoc, 'bool', true);
    assert.propertyVal(this.encryptedSimpleTestDoc, 'num', 42);
    assert.property(this.encryptedSimpleTestDoc, 'date');
    assert.equal(
      this.encryptedSimpleTestDoc.date.toString(),
      new Date('2014-05-19T16:39:07.536Z').toString()
    );
    assert.equal(this.encryptedSimpleTestDoc.id2.toString(), '5303e65d34e1e80d7a7ce212');
    assert.lengthOf(this.encryptedSimpleTestDoc.arr, 2);
    assert.equal(this.encryptedSimpleTestDoc.arr[0], 'alpha');
    assert.equal(this.encryptedSimpleTestDoc.arr[1], 'bravo');
    assert.property(this.encryptedSimpleTestDoc, 'mix');
    assert.deepEqual(this.encryptedSimpleTestDoc.mix, {
      str: 'A string',
      bool: false
    });
    assert.property(this.encryptedSimpleTestDoc, 'buf');
    assert.equal(this.encryptedSimpleTestDoc.buf.toString(), 'abcdefg');
    assert.propertyVal(this.encryptedSimpleTestDoc, 'idx', 'Indexed');
    assert.property(this.encryptedSimpleTestDoc, '_id');
    assert.notProperty(this.encryptedSimpleTestDoc.toObject(), '_ct');
  });
  it('should return an unencrypted version when run after #encrypt', async function() {
    await this.simpleTestDoc6.decrypt();
    assert.propertyVal(this.simpleTestDoc6, 'text', 'Unencrypted text');
    assert.propertyVal(this.simpleTestDoc6, 'bool', true);
    assert.propertyVal(this.simpleTestDoc6, 'num', 42);
    assert.property(this.simpleTestDoc6, 'date');
    assert.equal(
      this.simpleTestDoc6.date.toString(),
      new Date('2014-05-19T16:39:07.536Z').toString()
    );
    assert.equal(this.simpleTestDoc6.id2.toString(), '5303e65d34e1e80d7a7ce212');
    assert.lengthOf(this.simpleTestDoc6.arr, 2);
    assert.equal(this.simpleTestDoc6.arr[0], 'alpha');
    assert.equal(this.simpleTestDoc6.arr[1], 'bravo');
    assert.property(this.simpleTestDoc6, 'mix');
    assert.deepEqual(this.simpleTestDoc6.mix, {
      str: 'A string',
      bool: false
    });
    assert.property(this.simpleTestDoc6, 'buf');
    assert.equal(this.simpleTestDoc6.buf.toString(), 'abcdefg');
    assert.propertyVal(this.simpleTestDoc6, 'idx', 'Indexed');
    assert.property(this.simpleTestDoc6, '_id');
    assert.notProperty(this.simpleTestDoc6.toObject(), '_ct');
  });
  it('should return an unencrypted version even if document already decrypted', async function() {
    await this.encryptedSimpleTestDoc.decrypt();
    await this.encryptedSimpleTestDoc.decrypt();
    assert.propertyVal(this.encryptedSimpleTestDoc, 'text', 'Unencrypted text');
    assert.propertyVal(this.encryptedSimpleTestDoc, 'bool', true);
    assert.propertyVal(this.encryptedSimpleTestDoc, 'num', 42);
    assert.property(this.encryptedSimpleTestDoc, 'date');
    assert.equal(
      this.encryptedSimpleTestDoc.date.toString(),
      new Date('2014-05-19T16:39:07.536Z').toString()
    );
    assert.equal(this.encryptedSimpleTestDoc.id2.toString(), '5303e65d34e1e80d7a7ce212');
    assert.lengthOf(this.encryptedSimpleTestDoc.arr, 2);
    assert.equal(this.encryptedSimpleTestDoc.arr[0], 'alpha');
    assert.equal(this.encryptedSimpleTestDoc.arr[1], 'bravo');
    assert.property(this.encryptedSimpleTestDoc, 'mix');
    assert.deepEqual(this.encryptedSimpleTestDoc.mix, {
      str: 'A string',
      bool: false
    });
    assert.property(this.encryptedSimpleTestDoc, 'buf');
    assert.equal(this.encryptedSimpleTestDoc.buf.toString(), 'abcdefg');
    assert.propertyVal(this.encryptedSimpleTestDoc, 'idx', 'Indexed');
    assert.property(this.encryptedSimpleTestDoc, '_id');
    assert.notProperty(this.encryptedSimpleTestDoc.toObject(), '_ct');
  });
});

describe('document.decryptSync()', function() {
  let simpleTestDoc7 = null;
  before(async function() {
    simpleTestDoc7 = new BasicEncryptedModel({
      text: 'Unencrypted text',
      bool: true,
      num: 42,
      date: new Date('2014-05-19T16:39:07.536Z'),
      id2: '5303e65d34e1e80d7a7ce212',
      arr: ['alpha', 'bravo'],
      mix: {
        str: 'A string',
        bool: false
      },
      buf: Buffer.from('abcdefg'),
      idx: 'Indexed'
    });
    simpleTestDoc7.encrypt();
  });
  after(async function() {
    await simpleTestDoc7.remove();
  });
  it('should return an unencrypted version', function() {
    simpleTestDoc7.decryptSync();
    assert.propertyVal(simpleTestDoc7, 'text', 'Unencrypted text');
    assert.propertyVal(simpleTestDoc7, 'bool', true);
    assert.propertyVal(simpleTestDoc7, 'num', 42);
    assert.property(simpleTestDoc7, 'date');
    assert.equal(simpleTestDoc7.date.toString(), new Date('2014-05-19T16:39:07.536Z').toString());
    assert.equal(simpleTestDoc7.id2.toString(), '5303e65d34e1e80d7a7ce212');
    assert.lengthOf(simpleTestDoc7.arr, 2);
    assert.equal(simpleTestDoc7.arr[0], 'alpha');
    assert.equal(simpleTestDoc7.arr[1], 'bravo');
    assert.property(simpleTestDoc7, 'mix');
    assert.deepEqual(simpleTestDoc7.mix, {
      str: 'A string',
      bool: false
    });
    assert.property(simpleTestDoc7, 'buf');
    assert.equal(simpleTestDoc7.buf.toString(), 'abcdefg');
    assert.propertyVal(simpleTestDoc7, 'idx', 'Indexed');
    assert.property(simpleTestDoc7, '_id');
    assert.notProperty(simpleTestDoc7.toObject(), '_ct');
  });
  it('should return an unencrypted version even if document already decrypted', function() {
    simpleTestDoc7.decryptSync();
    assert.propertyVal(simpleTestDoc7, 'text', 'Unencrypted text');
    assert.propertyVal(simpleTestDoc7, 'bool', true);
    assert.propertyVal(simpleTestDoc7, 'num', 42);
    assert.property(simpleTestDoc7, 'date');
    assert.equal(simpleTestDoc7.date.toString(), new Date('2014-05-19T16:39:07.536Z').toString());
    assert.equal(simpleTestDoc7.id2.toString(), '5303e65d34e1e80d7a7ce212');
    assert.lengthOf(simpleTestDoc7.arr, 2);
    assert.equal(simpleTestDoc7.arr[0], 'alpha');
    assert.equal(simpleTestDoc7.arr[1], 'bravo');
    assert.property(simpleTestDoc7, 'mix');
    assert.deepEqual(simpleTestDoc7.mix, {
      str: 'A string',
      bool: false
    });
    assert.property(simpleTestDoc7, 'buf');
    assert.equal(simpleTestDoc7.buf.toString(), 'abcdefg');
    assert.propertyVal(simpleTestDoc7, 'idx', 'Indexed');
    assert.property(simpleTestDoc7, '_id');
    assert.notProperty(simpleTestDoc7.toObject(), '_ct');
  });
});

describe('"encryptedFields" option', function() {
  it('should encrypt fields iff they are in the passed in "encryptedFields" array even if those fields are indexed', async function() {
    const EncryptedFieldsModelSchema = mongoose.Schema({
      text: {
        type: String,
        index: true
      },
      bool: {
        type: Boolean
      },
      num: {
        type: Number
      }
    });
    EncryptedFieldsModelSchema.plugin(encrypt, {
      encryptionKey,
      signingKey,
      collectionId: 'EncryptedFields',
      encryptedFields: ['text', 'bool']
    });
    const FieldsEncryptedModel = mongoose.model('Fields', EncryptedFieldsModelSchema);
    const fieldsEncryptedDoc = new FieldsEncryptedModel({
      text: 'Unencrypted text',
      bool: false,
      num: 43
    });
    await fieldsEncryptedDoc.encrypt();
    assert.equal(fieldsEncryptedDoc.text, undefined);
    assert.equal(fieldsEncryptedDoc.bool, undefined);
    assert.propertyVal(fieldsEncryptedDoc, 'num', 43);
    await fieldsEncryptedDoc.decrypt();
    assert.equal(fieldsEncryptedDoc.text, 'Unencrypted text');
    assert.equal(fieldsEncryptedDoc.bool, false);
    assert.propertyVal(fieldsEncryptedDoc, 'num', 43);
  });
  it('should override other options', async function() {
    const EncryptedFieldsOverrideModelSchema = mongoose.Schema({
      text: {
        type: String,
        index: true
      },
      bool: {
        type: Boolean
      },
      num: {
        type: Number
      }
    });
    EncryptedFieldsOverrideModelSchema.plugin(encrypt, {
      encryptionKey,
      signingKey,
      collectionId: 'EncryptedFieldsOverride',
      encryptedFields: ['text', 'bool'],
      excludeFromEncryption: ['bool']
    });
    const FieldsOverrideEncryptedModel = mongoose.model(
      'FieldsOverride',
      EncryptedFieldsOverrideModelSchema
    );
    const fieldsEncryptedDoc = new FieldsOverrideEncryptedModel({
      text: 'Unencrypted text',
      bool: false,
      num: 43
    });
    await fieldsEncryptedDoc.encrypt();
    assert.equal(fieldsEncryptedDoc.text, undefined);
    assert.equal(fieldsEncryptedDoc.bool, undefined);
    assert.propertyVal(fieldsEncryptedDoc, 'num', 43);
    await fieldsEncryptedDoc.decrypt();
    assert.equal(fieldsEncryptedDoc.text, 'Unencrypted text');
    assert.equal(fieldsEncryptedDoc.bool, false);
    assert.propertyVal(fieldsEncryptedDoc, 'num', 43);
  });
});

describe('"excludeFromEncryption" option', function() {
  it('should encrypt all non-indexed fields except those in the passed-in "excludeFromEncryption" array', async function() {
    const ExcludeEncryptedModelSchema = mongoose.Schema({
      text: {
        type: String
      },
      bool: {
        type: Boolean
      },
      num: {
        type: Number
      },
      idx: {
        type: String,
        index: true
      }
    });
    ExcludeEncryptedModelSchema.plugin(encrypt, {
      encryptionKey,
      signingKey,
      collectionId: 'ExcludeEncrypted',
      excludeFromEncryption: ['num']
    });
    const ExcludeEncryptedModel = mongoose.model('Exclude', ExcludeEncryptedModelSchema);
    const excludeEncryptedDoc = new ExcludeEncryptedModel({
      text: 'Unencrypted text',
      bool: false,
      num: 43,
      idx: 'Indexed'
    });
    await excludeEncryptedDoc.encrypt();
    assert.equal(excludeEncryptedDoc.text, undefined);
    assert.equal(excludeEncryptedDoc.bool, undefined);
    assert.propertyVal(excludeEncryptedDoc, 'num', 43);
    assert.propertyVal(excludeEncryptedDoc, 'idx', 'Indexed');
    await excludeEncryptedDoc.decrypt();
    assert.equal(excludeEncryptedDoc.text, 'Unencrypted text');
    assert.equal(excludeEncryptedDoc.bool, false);
    assert.propertyVal(excludeEncryptedDoc, 'num', 43);
    assert.propertyVal(excludeEncryptedDoc, 'idx', 'Indexed');
  });
});

describe('"decryptPostSave" option', function() {
  before(function() {
    const HighPerformanceModelSchema = mongoose.Schema({
      text: {
        type: String
      }
    });
    HighPerformanceModelSchema.plugin(encrypt, {
      secret,
      decryptPostSave: false
    });
    this.HighPerformanceModel = mongoose.model('HighPerformance', HighPerformanceModelSchema);
  });
  beforeEach(function() {
    this.doc = new this.HighPerformanceModel({
      text: 'Unencrypted text'
    });
  });
  afterEach(async function() {
    await this.HighPerformanceModel.remove();
  });
  it('saves encrypted fields correctly', async function() {
    await this.doc.save();
    const docs = await this.HighPerformanceModel.find({
      _id: this.doc._id,
      _ct: {
        $exists: true
      },
      text: {
        $exists: false
      }
    });
    assert.lengthOf(docs, 1);
    assert.propertyVal(docs[0], 'text', 'Unencrypted text');
  });
  it('returns encrypted data after save', async function() {
    const savedDoc = await this.doc.save();
    assert.property(savedDoc, '_ct', 'Document remains encrypted after save');
    assert.notProperty(savedDoc.toObject(), 'text');
    await savedDoc.decrypt();
    assert.notProperty(savedDoc.toObject(), '_ct');
    assert.propertyVal(savedDoc, 'text', 'Unencrypted text', 'Document can still be unencrypted');
  });
});

describe('Array EmbeddedDocument', function() {
  describe('when only child is encrypted', function() {
    describe('and parent does not have encryptedChildren plugin', function() {
      before(function() {
        const ChildModelSchema = mongoose.Schema({
          text: {
            type: String
          }
        });
        ChildModelSchema.plugin(encrypt, {
          encryptionKey,
          signingKey
        });
        const ParentModelSchema = mongoose.Schema({
          text: {
            type: String
          },
          children: [ChildModelSchema]
        });
        this.ParentModel = mongoose.model('Parent', ParentModelSchema);
        this.ChildModel = mongoose.model('Child', ChildModelSchema);
      });
      beforeEach(async function() {
        this.parentDoc = new this.ParentModel({
          text: 'Unencrypted text'
        });
        const childDoc = new this.ChildModel({
          text: 'Child unencrypted text'
        });
        const childDoc2 = new this.ChildModel({
          text: 'Second unencrypted text'
        });
        this.parentDoc.children.addToSet(childDoc);
        this.parentDoc.children.addToSet(childDoc2);
        await this.parentDoc.save();
      });
      after(async function() {
        await this.parentDoc.remove();
      });
      describe('document.save()', function() {
        it('should not have decrypted fields', function() {
          assert.equal(this.parentDoc.children[0].text, undefined);
        });
        it('should persist children as encrypted', async function() {
          const docs = await this.ParentModel.find({
            _id: this.parentDoc._id,
            'children._ct': {
              $exists: true
            },
            'children.text': {
              $exists: false
            }
          });
          assert.lengthOf(docs, 1);
          assert.propertyVal(docs[0].children[0], 'text', 'Child unencrypted text');
        });
      });
      describe('document.find()', function() {
        it('when parent doc found, should pass an unencrypted version of the embedded document to the callback', async function() {
          const doc = await this.ParentModel.findById(this.parentDoc._id);
          assert.propertyVal(doc, 'text', 'Unencrypted text');
          assert.isArray(doc.children);
          assert.isObject(doc.children[0]);
          assert.property(doc.children[0], 'text', 'Child unencrypted text');
          assert.property(doc.children[0], '_id');
          assert.notProperty(doc.toObject().children[0], '_ct');
        });
      });
      describe('tampering with child documents by swapping their ciphertext', function() {
        it('should not cause an error because embedded documents are not self-authenticated', async function() {
          const doc = await this.ParentModel.findById(this.parentDoc._id).lean();
          assert.isArray(doc.children);
          const childDoc1CipherText = doc.children[0]._ct;
          const childDoc2CipherText = doc.children[1]._ct;
          await this.ParentModel.update(
            {
              _id: this.parentDoc._id
            },
            {
              $set: {
                'children.0._ct': childDoc2CipherText,
                'children.1._ct': childDoc1CipherText
              }
            }
          );
          const docAgain = await this.ParentModel.findById(this.parentDoc._id);
          assert.isArray(docAgain.children);
          assert.property(
            docAgain.children[0],
            'text',
            'Second unencrypted text',
            'Ciphertext was swapped'
          );
          assert.property(
            docAgain.children[1],
            'text',
            'Child unencrypted text',
            'Ciphertext was swapped'
          );
        });
      });
    });
    describe('and parent has encryptedChildren plugin', function() {
      before(function() {
        const ChildModelSchema = mongoose.Schema({
          text: {
            type: String
          }
        });
        ChildModelSchema.plugin(encrypt, {
          encryptionKey,
          signingKey
        });
        const ParentModelSchema = mongoose.Schema({
          text: {
            type: String
          },
          children: [ChildModelSchema]
        });
        ParentModelSchema.plugin(encrypt.encryptedChildren);
        this.ParentModel = mongoose.model('ParentEC', ParentModelSchema);
        this.ChildModel = mongoose.model('ChildOfECP', ChildModelSchema);
      });
      beforeEach(async function() {
        this.parentDoc = new this.ParentModel({
          text: 'Unencrypted text'
        });
        const childDoc = new this.ChildModel({
          text: 'Child unencrypted text'
        });
        const childDoc2 = new this.ChildModel({
          text: 'Second unencrypted text'
        });
        this.parentDoc.children.addToSet(childDoc);
        this.parentDoc.children.addToSet(childDoc2);
        await this.parentDoc.save();
      });
      after(async function() {
        await this.parentDoc.remove();
      });
      describe('document.save()', function() {
        it('should have decrypted fields', function() {
          assert.equal(this.parentDoc.children[0].text, 'Child unencrypted text');
        });
        it('should persist children as encrypted', async function() {
          const docs = await this.ParentModel.find({
            _id: this.parentDoc._id,
            'children._ct': {
              $exists: true
            },
            'children.text': {
              $exists: false
            }
          });
          assert.lengthOf(docs, 1);
          assert.propertyVal(docs[0].children[0], 'text', 'Child unencrypted text');
        });
      });
      describe('document.find()', function() {
        it('when parent doc found, should pass an unencrypted version of the embedded document to the callback', async function() {
          const doc = await this.ParentModel.findById(this.parentDoc._id);
          assert.propertyVal(doc, 'text', 'Unencrypted text');
          assert.isArray(doc.children);
          assert.isObject(doc.children[0]);
          assert.property(doc.children[0], 'text', 'Child unencrypted text');
          assert.property(doc.children[0], '_id');
          assert.notProperty(doc.toObject().children[0], '_ct');
        });
      });
      describe('tampering with child documents by swapping their ciphertext', function() {
        it('should not cause an error because embedded documents are not self-authenticated', async function() {
          const doc = await this.ParentModel.findById(this.parentDoc._id).lean();
          assert.isArray(doc.children);
          const childDoc1CipherText = doc.children[0]._ct;
          const childDoc2CipherText = doc.children[1]._ct;
          await this.ParentModel.update(
            {
              _id: this.parentDoc._id
            },
            {
              $set: {
                'children.0._ct': childDoc2CipherText,
                'children.1._ct': childDoc1CipherText
              }
            }
          );
          const docAgain = await this.ParentModel.findById(this.parentDoc._id);
          assert.isArray(docAgain.children);
          assert.property(
            docAgain.children[0],
            'text',
            'Second unencrypted text',
            'Ciphertext was swapped'
          );
          assert.property(
            docAgain.children[1],
            'text',
            'Child unencrypted text',
            'Ciphertext was swapped'
          );
        });
      });
      describe('when child is encrypted and authenticated', function() {
        before(function() {
          const ChildModelSchema = mongoose.Schema({
            text: {
              type: String
            }
          });
          ChildModelSchema.plugin(encrypt, {
            encryptionKey,
            signingKey
          });
          const ParentModelSchema = mongoose.Schema({
            text: {
              type: String
            },
            children: [ChildModelSchema]
          });
          ParentModelSchema.plugin(encrypt, {
            encryptionKey,
            signingKey,
            encryptedFields: [],
            additionalAuthenticatedFields: ['children']
          });
          this.ParentModel = mongoose.model('ParentWithAuth', ParentModelSchema);
          this.ChildModel = mongoose.model('ChildWithAuth', ChildModelSchema);
        });
        beforeEach(async function() {
          this.parentDoc = new this.ParentModel({
            text: 'Unencrypted text'
          });
          const childDoc = new this.ChildModel({
            text: 'Child unencrypted text'
          });
          const childDoc2 = new this.ChildModel({
            text: 'Second unencrypted text'
          });
          this.parentDoc.children.addToSet(childDoc);
          this.parentDoc.children.addToSet(childDoc2);
          await this.parentDoc.save();
        });
        after(async function() {
          await this.parentDoc.remove();
        });
        it('should persist children as encrypted after removing a child', async function() {
          return this.ParentModel.findById(
            this.parentDoc._id,
            (function(_this) {
              return function(err, doc) {
                if (err) {
                  return done(err);
                }
                assert.ok(doc, 'should have found doc with encrypted children');
                doc.children.id(doc.children[1]._id).remove();
                return doc.save(function(err) {
                  if (err) {
                    return done(err);
                  }
                  return this.ParentModel.find(
                    {
                      _id: this.parentDoc._id,
                      'children._ct': {
                        $exists: true
                      },
                      'children.text': {
                        $exists: false
                      }
                    },
                    function(err, docs) {
                      if (err) {
                        return done(err);
                      }
                      assert.ok(doc, 'should have found doc with encrypted children');
                      assert.equal(doc.children.length, 1);
                      done();
                    }
                  );
                });
              };
            })(this)
          );
        });
        it('should persist children as encrypted after adding a child', async function() {
          return this.ParentModel.findById(
            this.parentDoc._id,
            (function(_this) {
              return function(err, doc) {
                if (err) {
                  return done(err);
                }
                assert.ok(doc, 'should have found doc with encrypted children');
                doc.children.addToSet({
                  text: 'new child'
                });
                return doc.save(function(err) {
                  if (err) {
                    return done(err);
                  }
                  return this.ParentModel.findById(this.parentDoc._id).exec(function(err, doc) {
                    if (err) {
                      return done(err);
                    }
                    assert.ok(doc, 'should have found doc with encrypted children');
                    assert.equal(doc.children.length, 3);
                    done();
                  });
                });
              };
            })(this)
          );
        });
      });
    });
    describe('when child and parent are encrypted', function() {
      before(function() {
        let ChildModelSchema, ParentModelSchema;
        ChildModelSchema = mongoose.Schema({
          text: {
            type: String
          }
        });
        ChildModelSchema.plugin(encrypt, {
          encryptionKey,
          signingKey
        });
        ParentModelSchema = mongoose.Schema({
          text: {
            type: String
          },
          children: [ChildModelSchema]
        });
        ParentModelSchema.plugin(encrypt, {
          encryptionKey,
          signingKey,
          encryptedFields: ['text'],
          additionalAuthenticatedFields: ['children']
        });
        this.ParentModel = mongoose.model('ParentBoth', ParentModelSchema);
        this.ChildModel = mongoose.model('ChildBoth', ChildModelSchema);
      });
      beforeEach(async function() {
        let childDoc, childDoc2;
        this.parentDoc = new this.ParentModel({
          text: 'Unencrypted text'
        });
        childDoc = new this.ChildModel({
          text: 'Child unencrypted text'
        });
        childDoc2 = new this.ChildModel({
          text: 'Second unencrypted text'
        });
        this.parentDoc.children.addToSet(childDoc);
        this.parentDoc.children.addToSet(childDoc2);
        await this.parentDoc.save();
      });
      after(async function() {
        await this.parentDoc.remove();
      });
      describe('document.save()', function() {
        it('should have decrypted fields on parent', function() {
          assert.equal(this.parentDoc.text, 'Unencrypted text');
        });
        it('should have decrypted fields', function() {
          assert.equal(this.parentDoc.children[0].text, 'Child unencrypted text');
        });
        it('should persist children as encrypted', async function() {
          return this.ParentModel.find(
            {
              _id: this.parentDoc._id,
              'children._ct': {
                $exists: true
              },
              'children.text': {
                $exists: false
              }
            },
            function(err, docs) {
              assert.lengthOf(docs, 1);
              assert.propertyVal(docs[0].children[0], 'text', 'Child unencrypted text');
              done();
            }
          );
        });
      });
      describe('document.find()', function() {
        it('when parent doc found, should pass an unencrypted version of the embedded document to the callback', async function() {
          const doc = await this.ParentModel.findById(this.parentDoc._id);
          assert.propertyVal(doc, 'text', 'Unencrypted text');
          assert.isArray(doc.children);
          assert.isObject(doc.children[0]);
          assert.property(doc.children[0], 'text', 'Child unencrypted text');
          assert.property(doc.children[0], '_id');
          assert.notProperty(doc.toObject().children[0], '_ct');
        });
      });
      describe('when child field is in additionalAuthenticatedFields on parent and child documents are tampered with by swapping their ciphertext', function() {
        it('should pass an error', async function() {
          const doc = await this.ParentModel.findById(this.parentDoc._id).lean();
          assert.isArray(doc.children);
          const childDoc1CipherText = doc.children[0]._ct;
          const childDoc2CipherText = doc.children[1]._ct;
          await this.ParentModel.update(
            {
              _id: this.parentDoc._id
            },
            {
              $set: {
                'children.0._ct': childDoc2CipherText,
                'children.1._ct': childDoc1CipherText
              }
            }
          );
          await assert.isRejected(
            this.ParentModel.findById(this.parentDoc._id),
            /Authentication failed/
          );
        });
      });
    });
    describe('when entire parent is encrypted', function() {
      before(function() {
        let ParentModelSchema;
        ParentModelSchema = mongoose.Schema({
          text: {
            type: String
          },
          children: [
            {
              text: {
                type: String
              }
            }
          ]
        });
        ParentModelSchema.plugin(encrypt, {
          encryptionKey,
          signingKey
        });
        this.ParentModel = mongoose.model('ParentEntire', ParentModelSchema);
      });
      beforeEach(async function() {
        this.parentDoc = new this.ParentModel({
          text: 'Unencrypted text',
          children: [
            {
              text: 'Child unencrypted text'
            }
          ]
        });
        await this.parentDoc.save();
      });
      after(async function() {
        await this.parentDoc.remove();
      });
      describe('document.save()', function() {
        it('should have decrypted fields in document passed to call back', function() {
          assert.equal(this.parentDoc.text, 'Unencrypted text');
          assert.equal(this.parentDoc.children[0].text, 'Child unencrypted text');
        });
        it('should persist the entire document as encrypted', async function() {
          return this.ParentModel.find(
            {
              _id: this.parentDoc._id,
              _ct: {
                $exists: true
              },
              children: {
                $exists: false
              },
              'children.text': {
                $exists: false
              }
            },
            function(err, docs) {
              assert.lengthOf(docs, 1);
              assert.propertyVal(docs[0], 'text', 'Unencrypted text');
              assert.propertyVal(docs[0].children[0], 'text', 'Child unencrypted text');
              done();
            }
          );
        });
      });
      describe('document.find()', function() {
        it('when parent doc found, should pass an unencrypted version of the embedded document to the callback', async function() {
          const doc = await this.ParentModel.findById(this.parentDoc._id);
          assert.propertyVal(doc, 'text', 'Unencrypted text');
          assert.isArray(doc.children);
          assert.isObject(doc.children[0]);
          assert.property(doc.children[0], 'text', 'Child unencrypted text');
          assert.property(doc.children[0], '_id');
          assert.notProperty(doc.toObject().children[0], '_ct');
        });
      });
    });
    describe('Encrypted embedded document when parent has validation error and doesnt have encryptedChildren plugin', function() {
      before(function() {
        let ChildModelSchema, ParentModelSchema;
        ChildModelSchema = mongoose.Schema({
          text: {
            type: String
          }
        });
        ChildModelSchema.plugin(encrypt, {
          encryptionKey,
          signingKey,
          encryptedFields: ['text']
        });
        ParentModelSchema = mongoose.Schema({
          text: {
            type: String
          },
          children: [ChildModelSchema]
        });
        ParentModelSchema.pre('validate', function(next) {
          this.invalidate('text', 'invalid', this.text);
          return next();
        });
        this.ParentModel2 = mongoose.model('ParentWithoutPlugin', ParentModelSchema);
        this.ChildModel2 = mongoose.model('ChildAgain', ChildModelSchema);
      });
      it('should return unencrypted embedded documents', async function() {
        let doc;
        doc = new this.ParentModel2({
          text: 'here it is',
          children: [
            {
              text: 'Child unencrypted text'
            }
          ]
        });
        return doc.save(function(err) {
          assert.ok(err, 'There should be a validation error');
          assert.propertyVal(doc, 'text', 'here it is');
          assert.isArray(doc.children);
          assert.property(doc.children[0], '_id');
          assert.notProperty(doc.toObject().children[0], '_ct');
          assert.property(doc.children[0], 'text', 'Child unencrypted text');
          done();
        });
      });
    });
    describe('Encrypted embedded document when parent has validation error and has encryptedChildren plugin', function() {
      before(function() {
        let ChildModelSchema;
        ChildModelSchema = mongoose.Schema({
          text: {
            type: String
          }
        });
        ChildModelSchema.plugin(encrypt, {
          encryptionKey,
          signingKey,
          encryptedFields: ['text']
        });
        this.ParentModelSchema = mongoose.Schema({
          text: {
            type: String
          },
          children: [ChildModelSchema]
        });
        this.ParentModelSchema.pre('validate', function(next) {
          this.invalidate('text', 'invalid', this.text);
          return next();
        });
        this.sandbox = sinon.sandbox.create();
        this.sandbox.stub(console, 'warn');
        this.sandbox.spy(this.ParentModelSchema, 'post');
        this.ParentModelSchema.plugin(encrypt.encryptedChildren);
        this.ParentModel2 = mongoose.model('ParentWithPlugin', this.ParentModelSchema);
        this.ChildModel2 = mongoose.model('ChildOnceMore', ChildModelSchema);
      });
      after(function() {
        return this.sandbox.restore();
      });
      it('should return unencrypted embedded documents', async function() {
        let doc;
        doc = new this.ParentModel2({
          text: 'here it is',
          children: [
            {
              text: 'Child unencrypted text'
            }
          ]
        });
        return doc.save(function(err) {
          assert.ok(err, 'There should be a validation error');
          assert.propertyVal(doc, 'text', 'here it is');
          assert.isArray(doc.children);
          assert.property(doc.children[0], '_id');
          assert.notProperty(doc.toObject().children[0], '_ct');
          assert.property(doc.children[0], 'text', 'Child unencrypted text');
          done();
        });
      });
    });
    describe('Encrypted embedded document when parent has both encrypt and encryptedChildren plugins', function() {
      before(function() {
        let ChildModelSchema, ParentModelSchema;
        ChildModelSchema = mongoose.Schema({
          text: {
            type: String
          }
        });
        ChildModelSchema.plugin(encrypt, {
          encryptionKey,
          signingKey,
          encryptedFields: ['text']
        });
        ParentModelSchema = mongoose.Schema({
          text: {
            type: String
          },
          children: [ChildModelSchema],
          encryptedText: {
            type: String
          }
        });
        ParentModelSchema.plugin(encrypt.encryptedChildren);
        ParentModelSchema.plugin(encrypt, {
          encryptionKey,
          signingKey,
          encryptedFields: ['encryptedText']
        });
        this.ParentModel2 = mongoose.model('ParentWithBothPlugins', ParentModelSchema);
        this.ChildModel2 = mongoose.model('Child2', ChildModelSchema);
      });
      describe(
        'when parent document has validation error',
        (function(_this) {
          return function() {
            before(function() {
              this.invalidDoc = new this.ParentModel2({
                text: 'here it is',
                encryptedText: 'here is more',
                children: [
                  {
                    text: 'Child unencrypted text'
                  }
                ]
              });
              return this.invalidDoc.invalidate('text', 'invalid', this.text);
            });
            it('should return unencrypted parent and embedded documents', async function() {
              let doc;
              doc = this.invalidDoc;
              return this.invalidDoc.save(function(err) {
                assert.ok(err, 'There should be a validation error');
                assert.propertyVal(doc, 'text', 'here it is');
                assert.propertyVal(doc, 'encryptedText', 'here is more');
                assert.isArray(doc.children);
                assert.property(doc.children[0], '_id');
                assert.notProperty(doc.toObject().children[0], '_ct');
                assert.property(doc.children[0], 'text', 'Child unencrypted text');
                done();
              });
            });
          };
        })(this)
      );
      describe(
        'when parent document does not have validation error',
        (function(_this) {
          return function() {
            it('should return unencrypted parent and embedded documents', async function() {
              let doc;
              doc = new this.ParentModel2({
                text: 'here it is',
                encryptedText: 'here is more',
                children: [
                  {
                    text: 'Child unencrypted text'
                  }
                ]
              });
              return doc.save(function(err) {
                assert.propertyVal(doc, 'text', 'here it is');
                assert.isArray(doc.children);
                assert.property(doc.children[0], '_id');
                assert.notProperty(doc.toObject().children[0], '_ct');
                assert.property(doc.children[0], 'text', 'Child unencrypted text');
                done();
              });
            });
          };
        })(this)
      );
    });
  });

  describe('document.sign()', function() {
    before(async function() {
      this.testDoc = new BasicEncryptedModel({
        text: 'Unencrypted text',
        bool: true,
        num: 42,
        date: new Date('2014-05-19T16:39:07.536Z'),
        id2: '5303e65d34e1e80d7a7ce212',
        arr: ['alpha', 'bravo'],
        mix: {
          str: 'A string',
          bool: false
        },
        buf: Buffer.from('abcdefg'),
        idx: 'Indexed'
      });
      await this.testDoc.sign();
    });
    after(async function() {
      await this.testDoc.remove();
    });
    it('should return an signed version', function() {
      assert.property(this.testDoc, '_ac');
      this.initialAC = this.testDoc._ac;
    });
    it('should use the same signature if signed twice', async function() {
      return this.testDoc.sign(
        (function(_this) {
          return function(err) {
            assert.property(this.testDoc, '_ac');
            assert.ok(bufferEqual(this.testDoc._ac, this.initialAC));
            done();
          };
        })(this)
      );
    });
  });

  describe('document.sign() on encrypted document', function() {
    before(async function() {
      this.testDoc = new BasicEncryptedModel({
        text: 'Unencrypted text',
        bool: true,
        num: 42,
        date: new Date('2014-05-19T16:39:07.536Z'),
        id2: '5303e65d34e1e80d7a7ce212',
        arr: ['alpha', 'bravo'],
        mix: {
          str: 'A string',
          bool: false
        },
        buf: Buffer.from('abcdefg'),
        idx: 'Indexed'
      });
      return this.testDoc.encrypt(
        (function(_this) {
          return function(err) {
            return this.testDoc.sign(function(err) {
              done();
            });
          };
        })(this)
      );
    });
    after(async function() {
      return this.testDoc.remove();
    });
    it('should return an signed version', async function() {
      assert.property(this.testDoc, '_ac');
      this.initialAC = this.testDoc._ac;
    });
    it('should use the same signature if signed twice', async function() {
      await this.testDoc.sign();
      assert.property(this.testDoc, '_ac');
      assert.ok(bufferEqual(this.testDoc._ac, this.initialAC));
    });
  });

  describe('document.authenticateSync()', function() {
    this.testDocAS = null;
    beforeEach(async function() {
      this.testDocAS = new BasicEncryptedModel({
        text: 'Unencrypted text',
        bool: true,
        num: 42,
        date: new Date('2014-05-19T16:39:07.536Z'),
        id2: '5303e65d34e1e80d7a7ce212',
        arr: ['alpha', 'bravo'],
        mix: {
          str: 'A string',
          bool: false
        },
        buf: Buffer.from('abcdefg'),
        idx: 'Indexed'
      });
      await this.testDocAS.sign();
    });
    afterEach(async function() {
      await this.testDocAS.remove();
    });
    it('should return without an error if document is signed and unmodified', function() {
      assert.doesNotThrow(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
    it('should not throw error if a non-authenticated field has been modified', function() {
      this.testDocAS.num = 48;
      assert.doesNotThrow(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
    it('should throw error if _id has been modified', function() {
      this.testDocAS._id = new mongoose.Types.ObjectId();
      assert.throws(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
    it('should throw error if _ac has been modified randomly', function() {
      this.testDocAS._ac = Buffer.from('some random buffer');
      assert.throws(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
    it('should throw error if _ac has been modified to have authenticated fields = []', function() {
      let acWithoutAFLength, bareBuffer, blankArrayBuffer;
      acWithoutAFLength = encrypt.AAC_LENGTH + encrypt.VERSION_LENGTH;
      blankArrayBuffer = Buffer.from(JSON.stringify([]));
      bareBuffer = Buffer.from(acWithoutAFLength);
      bareBuffer.copy(this.testDocAS._ac, 0, 0, acWithoutAFLength);
      this.testDocAS._ac = Buffer.concat([bareBuffer, blankArrayBuffer]);
      assert.throws(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
    it('should throw error if _ac has been modified to have no authenticated fields section', function() {
      let acWithoutAFLength, poisonBuffer;
      acWithoutAFLength = encrypt.AAC_LENGTH + encrypt.VERSION_LENGTH;
      poisonBuffer = Buffer.from(acWithoutAFLength);
      poisonBuffer.copy(this.testDocAS._ac, 0, 0, acWithoutAFLength);
      this.testDocAS._ac = poisonBuffer;
      assert.throws(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
    it('should throw error if _ac has been set to null', function() {
      this.testDocAS._ac = null;
      assert.throws(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
    it('should throw error if _ac has been set to undefined', function() {
      this.testDocAS._ac = undefined;
      assert.throws(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
    it('should throw error if _ct has been added', function() {
      this.testDocAS._ct = Buffer.from('Poison');
      assert.throws(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
  });

  describe('document.authenticateSync() on encrypted documents', function() {
    this.testDocAS = null;
    beforeEach(async function() {
      this.testDocAS = new BasicEncryptedModel({
        text: 'Unencrypted text',
        bool: true,
        num: 42,
        date: new Date('2014-05-19T16:39:07.536Z'),
        id2: '5303e65d34e1e80d7a7ce212',
        arr: ['alpha', 'bravo'],
        mix: {
          str: 'A string',
          bool: false
        },
        buf: Buffer.from('abcdefg'),
        idx: 'Indexed'
      });
      return this.testDocAS.encrypt(
        (function(_this) {
          return function(err) {
            return this.testDocAS.sign(function(err) {
              done();
            });
          };
        })(this)
      );
    });
    afterEach(async function() {
      return this.testDocAS.remove();
    });
    it('should return without an error if document is signed and unmodified', function() {
      assert.doesNotThrow(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
    it('should not throw error if a non-authenticated field has been modified', function() {
      this.testDocAS.num = 48;
      assert.doesNotThrow(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
    it('should throw error if _id has been modified', function() {
      this.testDocAS._id = new mongoose.Types.ObjectId();
      assert.throws(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
    it('should throw error if _ct has been modified', function() {
      this.testDocAS._ct = Buffer.from('Poison');
      assert.throws(
        (function(_this) {
          return function() {
            return this.testDocAS.authenticateSync();
          };
        })(this)
      );
    });
  });

  describe('document.authenticate()', function() {
    this.testDocA = null;
    beforeEach(async function() {
      this.testDocA = new BasicEncryptedModel({
        text: 'Unencrypted text',
        bool: true,
        num: 42,
        date: new Date('2014-05-19T16:39:07.536Z'),
        id2: '5303e65d34e1e80d7a7ce212',
        arr: ['alpha', 'bravo'],
        mix: {
          str: 'A string',
          bool: false
        },
        buf: Buffer.from('abcdefg'),
        idx: 'Indexed'
      });
      await this.testDocA.sign();
    });
    afterEach(async function() {
      await this.testDocA.remove();
    });
    it('should pass error if _ac has been modified to have authenticated fields = []', async function() {
      let acWithoutAFLength, bareBuffer, blankArrayBuffer;
      acWithoutAFLength = encrypt.AAC_LENGTH + encrypt.VERSION_LENGTH;
      blankArrayBuffer = Buffer.from(JSON.stringify([]));
      bareBuffer = Buffer.from(acWithoutAFLength);
      bareBuffer.copy(this.testDocA._ac, 0, 0, acWithoutAFLength);
      this.testDocA._ac = Buffer.concat([bareBuffer, blankArrayBuffer]);
      return this.testDocA.authenticate(function(err) {
        assert.ok(err);
        assert.equal(err.message, '_id must be in array of fields to authenticate');
        done();
      });
    });
    it('should pass error if _ac has been modified to have no authenticated fields section', async function() {
      let acWithoutAFLength, poisonBuffer;
      acWithoutAFLength = encrypt.AAC_LENGTH + encrypt.VERSION_LENGTH;
      poisonBuffer = Buffer.from(acWithoutAFLength);
      poisonBuffer.copy(this.testDocA._ac, 0, 0, acWithoutAFLength);
      this.testDocA._ac = poisonBuffer;
      return this.testDocA.authenticate(function(err) {
        assert.ok(err);
        assert.equal(err.message, '_ac is too short and has likely been cut off or modified');
        done();
      });
    });
  });

  describe('Tampering with an encrypted document', function() {
    before(async function() {
      this.testDoc = new BasicEncryptedModel({
        text: 'Unencrypted text',
        bool: true,
        num: 42,
        date: new Date('2014-05-19T16:39:07.536Z'),
        id2: '5303e65d34e1e80d7a7ce212',
        arr: ['alpha', 'bravo'],
        mix: {
          str: 'A string',
          bool: false
        },
        buf: Buffer.from('abcdefg'),
        idx: 'Indexed'
      });
      this.testDoc2 = new BasicEncryptedModel({
        text: 'Unencrypted text2',
        bool: true,
        num: 46,
        date: new Date('2014-05-19T16:22:07.536Z'),
        id2: '5303e65d34e1e80d7a7ce210',
        arr: ['alpha', 'dela'],
        mix: {
          str: 'A strings',
          bool: true
        },
        buf: Buffer.from('dssd'),
        idx: 'Indexed again'
      });
      return this.testDoc.save(
        (function(_this) {
          return function(err) {
            return this.testDoc2.save(function(err) {
              done();
            });
          };
        })(this)
      );
    });
    after(async function() {
      return this.testDoc.remove(
        (function(_this) {
          return function(err) {
            return this.testDoc2.remove();
          };
        })(this)
      );
    });
    it('should throw an error on .find() if _ct is swapped from another document', async function() {
      return BasicEncryptedModel.findOne({
        _id: this.testDoc2._id
      })
        .lean()
        .exec(
          (function(_this) {
            return function(err, doc2) {
              let ctForSwap;

              ctForSwap = doc2._ct.buffer;
              return BasicEncryptedModel.update(
                {
                  _id: this.testDoc._id
                },
                {
                  $set: {
                    _ct: doc2._ct
                  }
                }
              ).exec(function(err, raw) {
                let n;
                n = raw.n || raw;

                assert.equal(n, 1);
                return BasicEncryptedModel.findOne({
                  _id: this.testDoc._id
                }).exec(function(err, doc) {
                  assert.ok(err);
                  done();
                });
              });
            };
          })(this)
        );
    });
  });

  describe('additionalAuthenticatedFields option', function() {
    let AuthenticatedFieldsModel, AuthenticatedFieldsModelSchema;
    AuthenticatedFieldsModelSchema = mongoose.Schema({
      text: {
        type: String
      },
      bool: {
        type: Boolean
      },
      num: {
        type: Number
      }
    });
    AuthenticatedFieldsModelSchema.plugin(encrypt, {
      encryptionKey,
      signingKey,
      collectionId: 'AuthenticatedFields',
      encryptedFields: ['text'],
      additionalAuthenticatedFields: ['bool']
    });
    AuthenticatedFieldsModel = mongoose.model(
      'AuthenticatedFields',
      AuthenticatedFieldsModelSchema
    );
    this.testDocAF = null;
    beforeEach(async function() {
      this.testDocAF = new AuthenticatedFieldsModel({
        text: 'Unencrypted text',
        bool: true,
        num: 42
      });
      await this.testDocAF.save();
    });
    afterEach(async function() {
      await this.testDocAF.remove();
    });
    it('find should succeed if document is unmodified', async function() {
      return AuthenticatedFieldsModel.findById(
        this.testDocAF._id,
        (function(_this) {
          return function(err, doc) {
            done();
          };
        })(this)
      );
    });
    it('find should succeed if non-authenticated field is modified directly', async function() {
      return AuthenticatedFieldsModel.update(
        {
          _id: this.testDocAF._id
        },
        {
          $set: {
            num: 48
          }
        }
      ).exec(
        (function(_this) {
          return function(err, raw) {
            let n;
            n = raw.n || raw;

            assert.equal(n, 1);
            return AuthenticatedFieldsModel.findById(this.testDocAF._id, function(err, doc) {
              assert.propertyVal(doc, 'num', 48);
              done();
            });
          };
        })(this)
      );
    });
    it('find should fail if non-authenticated field is modified directly', async function() {
      return AuthenticatedFieldsModel.update(
        {
          _id: this.testDocAF._id
        },
        {
          $set: {
            bool: false
          }
        }
      ).exec(
        (function(_this) {
          return function(err, raw) {
            let n;
            n = raw.n || raw;

            assert.equal(n, 1);
            return AuthenticatedFieldsModel.findById(this.testDocAF._id, function(err, doc) {
              assert.ok(err, 'There was an error');
              assert.propertyVal(err, 'message', 'Authentication failed');
              done();
            });
          };
        })(this)
      );
    });
  });

  describe('"requireAuthenticationCode" option', function() {
    describe('set to false and plugin used with existing collection without a migration', function() {
      let LessSecureModel, LessSecureSchema;
      LessSecureSchema = mongoose.Schema({
        text: {
          type: String
        },
        bool: {
          type: Boolean
        },
        num: {
          type: Number
        }
      });
      LessSecureSchema.plugin(encrypt, {
        encryptionKey,
        signingKey,
        requireAuthenticationCode: false
      });
      LessSecureModel = mongoose.model('LessSecure', LessSecureSchema);
      before(async function() {
        let plainDoc, plainDoc2;
        plainDoc = {
          text: 'Plain',
          bool: true
        };
        plainDoc2 = {
          bool: false,
          num: 33
        };
        return LessSecureModel.collection.insert(
          [plainDoc, plainDoc2],
          (function(_this) {
            return function(err, raw) {
              let docs;

              docs = raw.ops || raw;
              this.docId = docs[0]._id;
              this.doc2Id = docs[1]._id;
              done();
            };
          })(this)
        );
      });
      after(async function() {
        await LessSecureModel.remove();
      });
      it('should just work', async function() {
        return LessSecureModel.findById(
          this.docId,
          (function(_this) {
            return function(err, unmigratedDoc1) {
              assert.equal(err, null, 'There should be no authentication error');
              assert.propertyVal(unmigratedDoc1, 'text', 'Plain');
              assert.propertyVal(unmigratedDoc1, 'bool', true);
              return unmigratedDoc1.save(function(err) {
                return LessSecureModel.findById(this.docId)
                  .lean()
                  .exec(function(err, rawDoc1) {
                    assert.notProperty(
                      rawDoc1.toObject(),
                      'text',
                      'raw in db shouldnt show encrypted properties'
                    );
                    assert.notProperty(rawDoc1.toObject(), 'bool');
                    assert.property(rawDoc1, '_ct', 'raw in db should have ciphertext');
                    assert.property(rawDoc1, '_ac', 'raw in db should have authentication code');
                    return LessSecureModel.findById(this.docId, function(err, unmigratedDoc1) {
                      assert.propertyVal(unmigratedDoc1, 'text', 'Plain');
                      assert.propertyVal(unmigratedDoc1, 'bool', true);
                      done();
                    });
                  });
              });
            };
          })(this)
        );
      });
    });
  });

  describe('period in field name in options', function() {
    it('should encrypt nested fields with dot notation', async function() {
      let NestedModel, NestedModelSchema, nestedDoc;
      NestedModelSchema = mongoose.Schema({
        nest: {
          secretBird: {
            type: String
          },
          secretBird2: {
            type: String
          },
          publicBird: {
            type: String
          }
        }
      });
      NestedModelSchema.plugin(encrypt, {
        encryptionKey,
        signingKey,
        collectionId: 'EncryptedFields',
        encryptedFields: ['nest.secretBird', 'nest.secretBird2'],
        additionalAuthenticatedFields: ['nest.publicBird']
      });
      NestedModel = mongoose.model('Nested', NestedModelSchema);
      nestedDoc = new NestedModel({
        nest: {
          secretBird: 'Unencrypted text',
          secretBird2: 'Unencrypted text 2',
          publicBird: 'Unencrypted text 3'
        }
      });
      await nestedDoc.encrypt();
      assert.equal(nestedDoc.nest.secretBird, undefined);
      assert.equal(nestedDoc.nest.secretBird2, undefined);
      assert.equal(nestedDoc.nest.publicBird, 'Unencrypted text 3');
      await nestedDoc.decrypt();
      assert.equal(nestedDoc.nest.secretBird, 'Unencrypted text');
      assert.equal(nestedDoc.nest.secretBird2, 'Unencrypted text 2');
      assert.equal(nestedDoc.nest.publicBird, 'Unencrypted text 3');
    });
    it('should encrypt nested fields with dot notation two layers deep', async function() {
      let NestedModel, NestedModelSchema, nestedDoc;
      NestedModelSchema = mongoose.Schema({
        nest: {
          secretBird: {
            topSecretEgg: {
              type: String
            }
          }
        }
      });
      NestedModelSchema.plugin(encrypt, {
        encryptionKey,
        signingKey,
        collectionId: 'EncryptedFields',
        encryptedFields: ['nest.secretBird.topSecretEgg']
      });
      NestedModel = mongoose.model('NestedNest', NestedModelSchema);
      nestedDoc = new NestedModel({
        nest: {
          secretBird: {
            topSecretEgg: 'Unencrypted text'
          }
        }
      });
      await nestedDoc.encrypt();
      assert.equal(nestedDoc.nest.secretBird.topSecretEgg, undefined);
      await nestedDoc.decrypt();
      assert.equal(nestedDoc.nest.secretBird.topSecretEgg, 'Unencrypted text');
    });
  });

  describe('saving same authenticated document twice asynchronously', function() {
    let TwoFieldAuthModel, TwoFieldAuthSchema;
    TwoFieldAuthModel = null;
    TwoFieldAuthSchema = mongoose.Schema({
      text: {
        type: String
      },
      num: {
        type: Number
      }
    });
    TwoFieldAuthSchema.plugin(encrypt, {
      secret,
      encryptedFields: [],
      additionalAuthenticatedFields: ['text', 'num']
    });
    TwoFieldAuthModel = mongoose.model('TwoField', TwoFieldAuthSchema);
    before(async function() {
      this.testDoc = new TwoFieldAuthModel({
        text: 'Unencrypted text',
        num: 42
      });
      return this.testDoc.save(done);
    });
    it('should not cause errors, and the second save to authenticated fields should override the first in order (a transaction is forced)', async function() {
      return TwoFieldAuthModel.findOne(
        {
          _id: this.testDoc._id
        },
        (function(_this) {
          return function(err, doc) {
            doc.text = 'Altered text';
            return TwoFieldAuthModel.findOne(
              {
                _id: this.testDoc._id
              },
              function(err, docAgain) {
                docAgain.num = 55;
                return doc.save(function(err) {
                  return docAgain.save(function(err) {
                    return TwoFieldAuthModel.find(
                      {
                        _id: this.testDoc._id
                      },
                      function(err, finalDocs) {
                        assert.lengthOf(finalDocs, 1);
                        assert.propertyVal(finalDocs[0], 'text', 'Unencrypted text');
                        assert.propertyVal(finalDocs[0], 'num', 55);
                        done();
                      }
                    );
                  });
                });
              }
            );
          };
        })(this)
      );
    });
  });

  describe('migrations', function() {
    describe('migrateToA static model method', function() {
      describe('on collection encrypted with previous version', function() {
        let MigrationModel, MigrationSchema, OriginalModel, OriginalSchema, OriginalSchemaObject;
        OriginalSchemaObject = {
          text: {
            type: String
          },
          bool: {
            type: Boolean
          },
          num: {
            type: Number
          },
          date: {
            type: Date
          },
          id2: {
            type: mongoose.Schema.Types.ObjectId
          },
          arr: [
            {
              type: String
            }
          ],
          mix: {
            type: mongoose.Schema.Types.Mixed
          },
          buf: {
            type: Buffer
          },
          idx: {
            type: String,
            index: true
          },
          unencryptedText: {
            type: String
          }
        };
        OriginalSchema = mongoose.Schema(OriginalSchemaObject);
        OriginalSchema.plugin(encrypt, {
          encryptionKey,
          signingKey,
          excludeFromEncryption: ['unencryptedText']
        });
        OriginalModel = mongoose.model('Old', OriginalSchema);
        MigrationSchema = mongoose.Schema(OriginalSchemaObject);
        MigrationSchema.plugin(encrypt.migrations, {
          encryptionKey,
          signingKey,
          excludeFromEncryption: ['unencryptedText'],
          collectionId: 'Old'
        });
        MigrationModel = mongoose.model('Migrate', MigrationSchema, 'olds');
        before(async function() {
          let bufferEncryptedWithOldVersion,
            bufferEncryptedWithOldVersion2,
            docEncryptedWithOldVersion,
            docEncryptedWithOldVersion2;
          bufferEncryptedWithOldVersion = Buffer.from(
            JSON.parse(
              '[130,155,222,38,127,97,89,38,0,26,14,38,24,35,147,38,119,60,112,58,75,92,205,170,72,4,149,87,48,23,162,92,92,59,16,76,124,225,243,209,155,91,213,99,95,49,110,233,229,165,6,128,162,246,117,146,209,170,138,43,74,172,159,212,237,4,0,112,55,3,132,46,80,183,66,236,176,58,221,47,153,248,211,71,76,148,215,217,66,169,77,11,133,134,128,50,166,231,164,110,136,95,207,187,179,101,208,230,6,77,125,49,211,24,210,160,99,166,76,180,183,57,179,129,85,6,64,34,210,114,217,176,49,50,122,192,27,189,146,125,212,133,40,100,7,190,2,237,166,89,131,31,197,225,211,79,205,208,185,209,252,151,159,6,58,140,122,151,99,241,211,129,148,105,33,198,18,118,235,202,55,7,20,138,27,31,173,181,170,97,15,193,174,243,100,175,135,164,154,239,158,217,205,109,165,84,38,37,2,55,5,67,20,82,247,116,167,67,250,84,91,204,244,92,217,86,177,71,174,244,136,169,57,140,226,85,239,160,128,10]'
            )
          );
          docEncryptedWithOldVersion = {
            _ct: bufferEncryptedWithOldVersion
          };
          bufferEncryptedWithOldVersion2 = Buffer.from(
            JSON.parse(
              '[54,71,156,112,212,239,137,202,17,196,176,29,93,28,27,150,212,76,5,153,218,234,68,160,236,158,155,221,186,180,72,0,254,236,240,38,167,173,132,20,235,170,98,78,16,221,86,253,121,49,152,28,40,152,216,45,223,201,241,68,85,1,52,2,6,25,25,120,29,75,246,117,164,103,252,40,16,163,45,240]'
            )
          );
          docEncryptedWithOldVersion2 = {
            _ct: bufferEncryptedWithOldVersion2,
            unencryptedText: 'Never was encrypted'
          };
          return OriginalModel.collection.insert(
            [docEncryptedWithOldVersion, docEncryptedWithOldVersion2],
            (function(_this) {
              return function(err, raw) {
                let docs;

                docs = raw.ops || raw;
                this.docId = docs[0]._id;
                this.doc2Id = docs[1]._id;
                return OriginalModel.findById(this.docId, function(err, doc) {
                  assert.ok(err, 'There should be an authentication error before migration');
                  assert.propertyVal(err, 'message', 'Authentication code missing');
                  done();
                });
              };
            })(this)
          );
        });
        after(async function() {
          await OriginalModel.remove();
        });
        it('should transform existing documents in collection such that they work with plugin version A', async function() {
          return MigrationModel.migrateToA(
            (function(_this) {
              return function(err) {
                return OriginalModel.findById(this.docId, function(err, migratedDoc1) {
                  assert.equal(
                    err,
                    null,
                    'There should be no authentication error after migration'
                  );
                  assert.propertyVal(migratedDoc1, 'text', 'Unencrypted text');
                  assert.propertyVal(migratedDoc1, 'bool', true);
                  assert.propertyVal(migratedDoc1, 'num', 42);
                  assert.property(migratedDoc1, 'date');
                  assert.equal(
                    migratedDoc1.date.toString(),
                    new Date('2014-05-19T16:39:07.536Z').toString()
                  );
                  assert.equal(migratedDoc1.id2.toString(), '5303e65d34e1e80d7a7ce212');
                  assert.lengthOf(migratedDoc1.arr, 2);
                  assert.equal(migratedDoc1.arr[0], 'alpha');
                  assert.equal(migratedDoc1.arr[1], 'bravo');
                  assert.property(migratedDoc1, 'mix');
                  assert.deepEqual(migratedDoc1.mix, {
                    str: 'A string',
                    bool: false
                  });
                  assert.property(migratedDoc1, 'buf');
                  assert.equal(migratedDoc1.buf.toString(), 'abcdefg');
                  assert.property(migratedDoc1, '_id');
                  assert.notProperty(migratedDoc1.toObject(), '_ct');
                  assert.notProperty(migratedDoc1.toObject(), '_ac');
                  return OriginalModel.findById(this.doc2Id, function(err, migratedDoc2) {
                    assert.equal(
                      err,
                      null,
                      'There should be no authentication error after migration'
                    );
                    assert.propertyVal(migratedDoc2, 'text', 'Some other text');
                    assert.propertyVal(migratedDoc2, 'bool', false);
                    assert.propertyVal(migratedDoc2, 'num', 40);
                    assert.propertyVal(migratedDoc2, 'unencryptedText', 'Never was encrypted');
                    done();
                  });
                });
              };
            })(this)
          );
        });
      });
      describe('on previously unencrypted collection', function() {
        let PreviouslyUnencryptedModel, PreviouslyUnencryptedSchema, schemaObject;
        schemaObject = {
          text: {
            type: String
          },
          bool: {
            type: Boolean
          },
          num: {
            type: Number
          }
        };
        PreviouslyUnencryptedSchema = mongoose.Schema(schemaObject);
        PreviouslyUnencryptedSchema.plugin(encrypt.migrations, {
          encryptionKey,
          signingKey
        });
        PreviouslyUnencryptedModel = mongoose.model('FormerlyPlain', PreviouslyUnencryptedSchema);
        before(async function() {
          let plainDoc, plainDoc2;
          plainDoc = {
            text: 'Plain',
            bool: true
          };
          plainDoc2 = {
            bool: false,
            num: 33
          };
          return PreviouslyUnencryptedModel.collection.insert(
            [plainDoc, plainDoc2],
            (function(_this) {
              return function(err, raw) {
                let docs;

                docs = raw.ops || raw;
                this.docId = docs[0]._id;
                this.doc2Id = docs[1]._id;
                done();
              };
            })(this)
          );
        });
        after(async function() {
          await PreviouslyUnencryptedModel.remove({});
        });
        it('should transform documents in an unencrypted collection such that they are signed and encrypted and work with plugin version A', async function() {
          return PreviouslyUnencryptedModel.migrateToA(
            (function(_this) {
              return function(err) {
                let PreviouslyUnencryptedModelMigrated, PreviouslyUnencryptedSchemaMigrated;

                PreviouslyUnencryptedSchemaMigrated = mongoose.Schema(schemaObject);
                PreviouslyUnencryptedSchemaMigrated.plugin(encrypt, {
                  encryptionKey,
                  signingKey,
                  _suppressDuplicatePluginError: true,
                  collectionId: 'FormerlyPlain'
                });
                PreviouslyUnencryptedModelMigrated = mongoose.model(
                  'FormerlyPlain2',
                  PreviouslyUnencryptedSchemaMigrated,
                  'formerlyplains'
                );
                return PreviouslyUnencryptedModelMigrated.findById(this.docId)
                  .lean()
                  .exec(function(err, migratedDoc) {
                    assert.notProperty(
                      migratedDoc.toObject(),
                      'text',
                      'Should be encrypted in db after migration'
                    );
                    assert.notProperty(migratedDoc.toObject(), 'bool');
                    assert.property(migratedDoc, '_ac');
                    assert.property(
                      migratedDoc,
                      '_ct',
                      'Should have ciphertext in raw db after migration'
                    );
                    return PreviouslyUnencryptedModelMigrated.findById(this.docId, function(
                      err,
                      migratedDoc
                    ) {
                      assert.equal(
                        err,
                        null,
                        'There should be no authentication error after migrated'
                      );
                      assert.propertyVal(migratedDoc, 'text', 'Plain');
                      assert.propertyVal(migratedDoc, 'bool', true);
                      return migratedDoc.save(function(err) {
                        return PreviouslyUnencryptedModelMigrated.findById(this.docId)
                          .lean()
                          .exec(function(err, migratedDoc) {
                            assert.notProperty(
                              migratedDoc.toObject(),
                              'text',
                              'Should be encrypted in raw db after saved'
                            );
                            assert.notProperty(migratedDoc.toObject(), 'bool');
                            assert.property(migratedDoc, '_ac');
                            assert.property(
                              migratedDoc,
                              '_ct',
                              'Should have ciphertext in raw db after saved'
                            );
                            done();
                          });
                      });
                    });
                  });
              };
            })(this)
          );
        });
      });
    });
    describe('migrateSubDocsToA static model method', function() {
      describe('on collection where subdocs encrypted with previous version', function() {
        before(async function() {
          let MigrationChildSchema,
            MigrationParentSchema,
            OriginalChildSchema,
            OriginalParentSchema,
            bufferEncryptedWithOldVersion,
            bufferEncryptedWithOldVersion2,
            docWithChildrenFromOldVersion;
          OriginalChildSchema = mongoose.Schema({
            text: {
              type: String
            }
          });
          OriginalChildSchema.plugin(encrypt, {
            encryptionKey,
            signingKey
          });
          OriginalParentSchema = mongoose.Schema({
            text: {
              type: String
            },
            children: [OriginalChildSchema]
          });
          this.OriginalParentModel = mongoose.model('ParentOriginal', OriginalParentSchema);
          this.OriginalChildModel = mongoose.model('ChildOriginal', OriginalChildSchema);
          MigrationChildSchema = mongoose.Schema({
            text: {
              type: String
            }
          });
          MigrationChildSchema.plugin(encrypt.migrations, {
            encryptionKey,
            signingKey
          });
          MigrationParentSchema = mongoose.Schema({
            text: {
              type: String
            },
            children: [MigrationChildSchema]
          });
          MigrationParentSchema.plugin(encrypt.migrations, {
            encryptionKey,
            signingKey
          });
          this.MigrationParentModel = mongoose.model(
            'ParentMigrate',
            MigrationParentSchema,
            'parentoriginals'
          );
          this.MigrationChildModel = mongoose.model('ChildMigrate', MigrationChildSchema);
          bufferEncryptedWithOldVersion = Buffer.from(
            JSON.parse(
              '[21,214,250,191,178,31,137,124,48,21,38,43,100,150,146,97,102,96,173,251,244,146,145,126,14,193,188,116,132,96,90,135,177,89,255,121,6,98,213,226,92,3,128,66,93,124,46,235,52,60,144,129,245,114,246,75,233,173,60,45,63,1,117,87]'
            )
          );
          bufferEncryptedWithOldVersion2 = Buffer.from(
            JSON.parse(
              '[227,144,73,209,193,222,74,228,115,162,19,213,103,68,229,61,81,100,152,178,4,134,249,159,245,132,29,186,163,91,211,169,77,162,140,113,105,136,167,174,105,24,50,219,80,150,226,182,99,45,236,85,133,163,19,76,234,83,158,231,68,205,158,248]'
            )
          );
          docWithChildrenFromOldVersion = {
            children: [
              {
                _ct: bufferEncryptedWithOldVersion,
                _id: new mongoose.Types.ObjectId()
              },
              {
                _ct: bufferEncryptedWithOldVersion2,
                _id: new mongoose.Types.ObjectId()
              }
            ]
          };
          return this.OriginalParentModel.collection.insert(
            [docWithChildrenFromOldVersion],
            (function(_this) {
              return function(err, raw) {
                let docs;

                docs = raw.ops || raw;
                this.docId = docs[0]._id;
                done();
              };
            })(this)
          );
        });
        after(async function() {
          await this.OriginalParentModel.remove();
        });
        it.skip('migration definitely needed', async function() {
          const doc = await this.OriginalParentModel.findById(this.docId);
          assert.equal(err, null, 'When error in subdoc pre init hook, swallowed by mongoose');
          assert.isArray(doc.children);
          assert.lengthOf(
            doc.children,
            0,
            'Children have errors in pre-init and so are no hydrated'
          );
        });
      });
      it('should transform existing documents in collection such that they work with plugin version A', async function() {
        await this.MigrationParentModel.migrateSubDocsToA('children');
        const migratedDoc = await this.OriginalParentModel.findById(this.docId);
        assert.isArray(migratedDoc.children);
        assert.lengthOf(migratedDoc.children, 2);
        assert.propertyVal(migratedDoc.children[0], 'text', 'Child unencrypted text');
        assert.propertyVal(migratedDoc.children[1], 'text', 'Child2 unencrypted text');
      });
    });
  });
  describe('signAll static model method', function() {
    let UnsignedModel, UnsignedSchema, schemaObject;
    schemaObject = {
      text: {
        type: String
      },
      bool: {
        type: Boolean
      },
      num: {
        type: Number
      }
    };
    UnsignedSchema = mongoose.Schema(schemaObject);
    UnsignedSchema.plugin(encrypt.migrations, {
      encryptionKey,
      signingKey
    });
    UnsignedModel = mongoose.model('Sign', UnsignedSchema);
    before(async function() {
      let plainDoc, plainDoc2;
      plainDoc = {
        text: 'Plain',
        bool: true
      };
      plainDoc2 = {
        bool: false,
        num: 33
      };
      return UnsignedModel.collection.insert(
        [plainDoc, plainDoc2],
        (function(_this) {
          return function(err, raw) {
            let docs;

            docs = raw.ops || raw;
            this.docId = docs[0]._id;
            this.doc2Id = docs[1]._id;
            done();
          };
        })(this)
      );
    });
    after(async function() {
      await UnsignedModel.remove({});
    });
    it('should transform documents in an unsigned collection such that they are signed and work with plugin version A', async function() {
      return UnsignedModel.signAll(
        (function(_this) {
          return function(err) {
            UnsignedSchema.plugin(encrypt, {
              encryptionKey,
              signingKey,
              _suppressDuplicatePluginError: true
            });
            return UnsignedModel.findById(this.docId, function(err, signedDoc) {
              assert.equal(err, null, 'There should be no authentication error after signing');
              assert.propertyVal(signedDoc, 'text', 'Plain');
              assert.propertyVal(signedDoc, 'bool', true);
              done();
            });
          };
        })(this)
      );
    });
  });
  describe('installing on schema alongside standard encrypt plugin', function() {
    it('should throw an error if installed after standard encrypt plugin', function() {
      const EncryptedSchema = mongoose.Schema({
        text: {
          type: String
        }
      });
      EncryptedSchema.plugin(encrypt, {
        secret
      });
      assert.throw(() => EncryptedSchema.plugin(encrypt.migrations, { secret }));
    });
    it('should cause encrypt plugin to throw an error if installed first', function() {
      let EncryptedSchema;
      EncryptedSchema = mongoose.Schema({
        text: {
          type: String
        }
      });
      EncryptedSchema.plugin(encrypt.migrations, {
        secret
      });
      assert.throw(function() {
        return EncryptedSchema.plugin(encrypt, {
          secret
        });
      });
    });
  });
});

// ---
// generated by coffee-script 1.9.2
