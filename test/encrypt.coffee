mongoose = require 'mongoose'
sinon = require 'sinon'
chai = require 'chai'
assert = chai.assert
mongoose.connect 'mongodb://localhost/mongoose-encryption-test'

encryptionKey = 'CwBDwGUwoM5YzBmzwWPSI+KjBKvWHaablbrEiDYh43Q='

encrypt = require '../index.js'

BasicEncryptedModel = null

before ->
  BasicEncryptedModelSchema = mongoose.Schema
    text: type: String
    bool: type: Boolean
    num: type: Number
    date: type: Date
    id2: type: mongoose.Schema.Types.ObjectId
    arr: [ type: String ]
    mix: type: mongoose.Schema.Types.Mixed
    buf: type: Buffer
    idx: type: String, index: true

  BasicEncryptedModelSchema.plugin encrypt, key: encryptionKey

  BasicEncryptedModel = mongoose.model 'Simple', BasicEncryptedModelSchema

describe 'encrypt plugin', ->
  it 'should add field _ct of type Buffer to the schema', ->
    encryptedSchema = mongoose.Schema({}).plugin(encrypt, key: encryptionKey)
    assert.property encryptedSchema.paths, '_ct'
    assert.propertyVal encryptedSchema.paths._ct, 'instance', 'Buffer'

  it 'should expose an encrypt method on documents', ->
    EncryptFnTestModel = mongoose.model 'EncryptFnTest', mongoose.Schema({}).plugin(encrypt, key: encryptionKey)
    assert.isFunction (new EncryptFnTestModel).encrypt

  it 'should expose a decrypt method on documents', ->
    DecryptFnTestModel = mongoose.model 'DecryptFnTest', mongoose.Schema({}).plugin(encrypt, key: encryptionKey)
    assert.isFunction (new DecryptFnTestModel).decrypt

describe 'new EncryptedModel', ->
  it 'should remain unaltered', (done) ->
    simpleTestDoc1 = new BasicEncryptedModel
      text: 'Unencrypted text'
      bool: true
      num: 42
      date: new Date '2014-05-19T16:39:07.536Z'
      id2: '5303e65d34e1e80d7a7ce212'
      arr: ['alpha', 'bravo']
      mix: { str: 'A string', bool: false }
      buf: new Buffer 'abcdefg'

    assert.propertyVal simpleTestDoc1, 'text', 'Unencrypted text'
    assert.propertyVal simpleTestDoc1, 'bool', true
    assert.propertyVal simpleTestDoc1, 'num', 42
    assert.property simpleTestDoc1, 'date'
    assert.equal simpleTestDoc1.date.toString(), new Date("2014-05-19T16:39:07.536Z").toString()
    assert.propertyVal simpleTestDoc1, 'id2', mongoose.Schema.Types.ObjectId '5303e65d34e1e80d7a7ce212'
    assert.lengthOf simpleTestDoc1.arr, 2
    assert.equal simpleTestDoc1.arr[0], 'alpha'
    assert.equal simpleTestDoc1.arr[1], 'bravo'
    assert.property simpleTestDoc1, 'mix'
    assert.deepEqual simpleTestDoc1.mix, { str: 'A string', bool: false }
    assert.property simpleTestDoc1, 'buf'
    assert.equal simpleTestDoc1.buf.toString(), 'abcdefg'
    assert.property simpleTestDoc1, '_id'
    assert.notProperty simpleTestDoc1, '_ct'
    done()

describe 'document.save()', ->
  before ->
    sinon.spy BasicEncryptedModel.prototype, 'encrypt'
    sinon.spy BasicEncryptedModel.prototype, 'decryptSync'

  beforeEach (done) ->
    BasicEncryptedModel.prototype.encrypt.reset()
    BasicEncryptedModel.prototype.decryptSync.reset()

    @simpleTestDoc2 = new BasicEncryptedModel
      text: 'Unencrypted text'
      bool: true
      num: 42
      date: new Date '2014-05-19T16:39:07.536Z'
      id2: '5303e65d34e1e80d7a7ce212'
      arr: ['alpha', 'bravo']
      mix: { str: 'A string', bool: false }
      buf: new Buffer 'abcdefg'

    @simpleTestDoc2.save (err) ->
      assert.equal err, null
      done()

  afterEach (done) ->
    @simpleTestDoc2.remove (err) ->
      assert.equal err, null
      done()

  it 'saves encrypted fields', (done) ->
    BasicEncryptedModel.find
      _id: @simpleTestDoc2._id
      _ct: $exists: true
      text: $exists: false
      bool: $exists: false
      num: $exists: false
      date: $exists: false
      id2: $exists: false
      arr: $exists: false
      mix: $exists: false
      buf: $exists: false
    , (err, docs) ->
      assert.lengthOf docs, 1
      done err

  it 'returns decrypted data after save', (done) ->
    @simpleTestDoc2.save (err, doc) ->
      assert.equal doc.text, 'Unencrypted text'
      assert.equal doc.bool, true
      assert.equal doc.num, 42
      assert.deepEqual doc.date, new Date('2014-05-19T16:39:07.536Z')
      assert.equal doc.id2, '5303e65d34e1e80d7a7ce212'
      assert.equal doc.arr.toString(), ['alpha', 'bravo'].toString()
      assert.deepEqual doc.mix, { str: 'A string', bool: false }
      assert.deepEqual doc.buf, new Buffer 'abcdefg'
      done err

   it 'should have called encrypt then decrypt', ->
    assert.equal @simpleTestDoc2.encrypt.callCount, 1
    assert.equal @simpleTestDoc2.decryptSync.callCount, 1
    assert @simpleTestDoc2.encrypt.calledBefore @simpleTestDoc2.decryptSync

describe 'document.save() when only certain fields are encrypted', ->
  before ->
    PartiallyEncryptedModelSchema = mongoose.Schema
      encryptedText: type: String
      unencryptedText: type: String

    PartiallyEncryptedModelSchema.plugin encrypt, key: encryptionKey, fields: ['encryptedText']

    @PartiallyEncryptedModel = mongoose.model 'PartiallyEncrypted', PartiallyEncryptedModelSchema

  beforeEach (done) ->
    @partiallyEncryptedDoc = new @PartiallyEncryptedModel
      encryptedText: 'Encrypted Text'
      unencryptedText: 'Unencrypted Text'

    @partiallyEncryptedDoc.save (err) ->
      assert.equal err, null
      done()

  afterEach (done) ->
    @partiallyEncryptedDoc.remove (err) ->
      assert.equal err, null
      done()

  it 'should have decrypted fields', ->
    assert.equal @partiallyEncryptedDoc.encryptedText, 'Encrypted Text'
    assert.propertyVal @partiallyEncryptedDoc, 'unencryptedText', 'Unencrypted Text'

  it 'should have encrypted fields undefined when encrypt is called', (done) ->
    @partiallyEncryptedDoc.encrypt =>
      assert.equal @partiallyEncryptedDoc.encryptedText, undefined
      assert.propertyVal @partiallyEncryptedDoc, 'unencryptedText', 'Unencrypted Text'
      done()

  it 'should have a field _ct containing a mongoose Buffer object which appears encrypted when encrypted', (done) ->
    @partiallyEncryptedDoc.encrypt =>
      assert.isObject @partiallyEncryptedDoc._ct
      assert.property @partiallyEncryptedDoc.toObject()._ct, 'buffer'
      assert.instanceOf @partiallyEncryptedDoc.toObject()._ct.buffer, Buffer
      assert.isString @partiallyEncryptedDoc.toObject()._ct.toString(), 'ciphertext can be converted to a string'
      assert.throw -> JSON.parse @partiallyEncryptedDoc.toObject()._ct.toString(), 'ciphertext is not parsable json'
      done()

  it 'should not overwrite _ct when saved after a find that didnt retrieve _ct', (done) ->
    @PartiallyEncryptedModel.findById(@partiallyEncryptedDoc).select('unencryptedText').exec (err, doc) =>
      assert.equal err, null
      assert.equal doc._ct, undefined
      assert.propertyVal doc, 'unencryptedText', 'Unencrypted Text', 'selected unencrypted fields should be found'
      doc.save (err) =>
        assert.equal err, null
        @PartiallyEncryptedModel.findById(@partiallyEncryptedDoc).select('unencryptedText _ct').exec (err, finalDoc) ->
          assert.equal finalDoc._ct, undefined
          assert.propertyVal finalDoc, 'unencryptedText', 'Unencrypted Text', 'selected unencrypted fields should still be found after the select -> save'
          assert.propertyVal finalDoc, 'encryptedText', 'Encrypted Text', 'encrypted fields werent overwritten during the select -> save'
          done()

describe 'EncryptedModel.create()', ->

  beforeEach ->
    @docContents =
      text: 'Unencrypted text'
      bool: true
      num: 42
      date: new Date '2014-05-19T16:39:07.536Z'
      id2: '5303e65d34e1e80d7a7ce212'
      arr: ['alpha', 'bravo']
      mix: { str: 'A string', bool: false }
      buf: new Buffer 'abcdefg'

  afterEach (done) ->
    BasicEncryptedModel.remove (err) ->
      assert.equal err, null
      done()

  it 'when doc created, it should pass an unencrypted version to the callback', (done) ->
    BasicEncryptedModel.create @docContents, (err, doc) ->
      console.log doc
      assert.equal err, null
      assert.propertyVal doc, 'text', 'Unencrypted text'
      assert.propertyVal doc, 'bool', true
      assert.propertyVal doc, 'num', 42
      assert.property doc, 'date'
      assert.equal doc.date.toString(), new Date("2014-05-19T16:39:07.536Z").toString()
      assert.propertyVal doc, 'id2', mongoose.Schema.Types.ObjectId '5303e65d34e1e80d7a7ce212'
      assert.lengthOf doc.arr, 2
      assert.equal doc.arr[0], 'alpha'
      assert.equal doc.arr[1], 'bravo'
      assert.property doc, 'mix'
      assert.deepEqual doc.mix, { str: 'A string', bool: false }
      assert.property doc, 'buf'
      assert.equal doc.buf.toString(), 'abcdefg'
      assert.property doc, '_id'
      assert.notProperty doc, '_ct'
      done()

  it 'after doc created, should be encrypted in db', (done) ->
    BasicEncryptedModel.create @docContents, (err, doc) ->
      assert.equal err, null
      assert.ok doc._id
      BasicEncryptedModel.find
        _id: doc._id
        _ct: $exists: true
        text: $exists: false
        bool: $exists: false
        num: $exists: false
        date: $exists: false
        id2: $exists: false
        arr: $exists: false
        mix: $exists: false
        buf: $exists: false
      , (err, docs) ->
        assert.lengthOf docs, 1
        done err


describe 'EncryptedModel.find()', ->
  simpleTestDoc3 = null
  before (done) ->
    simpleTestDoc3 = new BasicEncryptedModel
      text: 'Unencrypted text'
      bool: true
      num: 42
      date: new Date '2014-05-19T16:39:07.536Z'
      id2: '5303e65d34e1e80d7a7ce212'
      arr: ['alpha', 'bravo']
      mix: { str: 'A string', bool: false }
      buf: new Buffer 'abcdefg'
    simpleTestDoc3.save (err) ->
      assert.equal err, null
      done()

  after (done) ->
    simpleTestDoc3.remove (err) ->
      assert.equal err, null
      done()

  it 'when doc found, should pass an unencrypted version to the callback', (done) ->
    BasicEncryptedModel.findById simpleTestDoc3._id, (err, doc) ->
      assert.equal err, null
      assert.propertyVal doc, 'text', 'Unencrypted text'
      assert.propertyVal doc, 'bool', true
      assert.propertyVal doc, 'num', 42
      assert.property doc, 'date'
      assert.equal doc.date.toString(), new Date("2014-05-19T16:39:07.536Z").toString()
      assert.propertyVal doc, 'id2', mongoose.Schema.Types.ObjectId '5303e65d34e1e80d7a7ce212'
      assert.lengthOf doc.arr, 2
      assert.equal doc.arr[0], 'alpha'
      assert.equal doc.arr[1], 'bravo'
      assert.property doc, 'mix'
      assert.deepEqual doc.mix, { str: 'A string', bool: false }
      assert.property doc, 'buf'
      assert.equal doc.buf.toString(), 'abcdefg'
      assert.property doc, '_id'
      assert.notProperty doc, '_ct'
      done()

  it 'when doc not found by id, should pass null to the callback', (done) ->
    BasicEncryptedModel.findById '534ec48d60069bc13338b354', (err, doc) ->
      assert.equal err, null
      assert.equal doc, null
      done()

  it 'when doc not found by query, should pass [] to the callback', (done) ->
    BasicEncryptedModel.find text: 'banana', (err, doc) ->
      assert.equal err, null
      assert.isArray doc
      assert.lengthOf doc, 0
      done()

describe 'EncryptedModel.find() lean option', ->
  simpleTestDoc4 = null
  before (done) ->
    simpleTestDoc4 = new BasicEncryptedModel
      text: 'Unencrypted text'
      bool: true
      num: 42
      date: new Date '2014-05-19T16:39:07.536Z'
      id2: '5303e65d34e1e80d7a7ce212'
      arr: ['alpha', 'bravo']
      mix: { str: 'A string', bool: false }
      buf: new Buffer 'abcdefg'
    simpleTestDoc4.save (err) ->
      assert.equal err, null
      done()

  after (done) ->
    simpleTestDoc4.remove (err) ->
      assert.equal err, null
      done()

  it 'should have encrypted fields undefined on saved document', (done) ->
    BasicEncryptedModel.findById(simpleTestDoc4._id).lean().exec (err, doc) ->
      assert.equal doc.text, undefined
      assert.equal doc.bool, undefined
      assert.equal doc.num, undefined
      assert.equal doc.date, undefined
      assert.equal doc.id2, undefined
      assert.equal doc.arr, undefined
      assert.equal doc.mix, undefined
      assert.equal doc.buf, undefined
      done()

  it 'should have a field _ct containing a mongoose Buffer object which appears encrypted', (done) ->
    BasicEncryptedModel.findById(simpleTestDoc4._id).lean().exec (err, doc) ->
      assert.isObject doc._ct
      assert.property doc._ct, 'buffer'
      assert.instanceOf doc._ct.buffer, Buffer
      assert.isString doc._ct.toString(), 'ciphertext can be converted to a string'
      assert.throw -> JSON.parse doc._ct.toString(), 'ciphertext is not parsable json'
      done()


describe 'document.encrypt()', ->
  simpleTestDoc5 = null
  before (done) ->
    simpleTestDoc5 = new BasicEncryptedModel
      text: 'Unencrypted text'
      bool: true
      num: 42
      date: new Date '2014-05-19T16:39:07.536Z'
      id2: '5303e65d34e1e80d7a7ce212'
      arr: ['alpha', 'bravo']
      mix: { str: 'A string', bool: false }
      buf: new Buffer 'abcdefg'
      idx: 'Indexed'

    simpleTestDoc5.encrypt (err) ->
      assert.equal err, null
      done()

  after (done) ->
    simpleTestDoc5.remove (err) ->
      assert.equal err, null
      done()

  it 'should have encrypted fields undefined', (done) ->
    assert.equal simpleTestDoc5.text, undefined
    assert.equal simpleTestDoc5.bool, undefined
    assert.equal simpleTestDoc5.num, undefined
    assert.equal simpleTestDoc5.date, undefined
    assert.equal simpleTestDoc5.id2, undefined
    assert.equal simpleTestDoc5.arr, undefined
    assert.equal simpleTestDoc5.mix, undefined
    assert.equal simpleTestDoc5.buf, undefined
    done()

  it 'should not encrypt indexed fields by default', (done) ->
    assert.propertyVal simpleTestDoc5, 'idx', 'Indexed'
    done()

  it 'should have a field _ct containing a mongoose Buffer object which appears encrypted', (done) ->
    assert.isObject simpleTestDoc5._ct
    assert.property simpleTestDoc5.toObject()._ct, 'buffer'
    assert.instanceOf simpleTestDoc5.toObject()._ct.buffer, Buffer
    assert.isString simpleTestDoc5.toObject()._ct.toString(), 'ciphertext can be converted to a string'
    assert.throw -> JSON.parse simpleTestDoc5.toObject()._ct.toString(), 'ciphertext is not parsable json'
    done()

  it 'should have non-ascii characters in ciphertext as a result of encryption even if all input is ascii', (done) ->
    allAsciiDoc = new BasicEncryptedModel
      text: 'Unencrypted text'

    allAsciiDoc.encrypt (err) ->
      assert.equal err, null
      assert.notMatch allAsciiDoc.toObject()._ct.toString(), /^[\x00-\x7F]*$/
      done()



describe 'document.decrypt()', ->
  simpleTestDoc6 = null
  before (done) ->
    simpleTestDoc6 = new BasicEncryptedModel
      text: 'Unencrypted text'
      bool: true
      num: 42
      date: new Date '2014-05-19T16:39:07.536Z'
      id2: '5303e65d34e1e80d7a7ce212'
      arr: ['alpha', 'bravo']
      mix: { str: 'A string', bool: false }
      buf: new Buffer 'abcdefg'
      idx: 'Indexed'

    simpleTestDoc6.encrypt (err) ->
      assert.equal err, null
      done()

  after (done) ->
    simpleTestDoc6.remove (err) ->
      assert.equal err, null
      done()

  it 'should return an unencrypted version', (done) ->
    simpleTestDoc6.decrypt (err) ->
      assert.equal err, null
      assert.propertyVal simpleTestDoc6, 'text', 'Unencrypted text'
      assert.propertyVal simpleTestDoc6, 'bool', true
      assert.propertyVal simpleTestDoc6, 'num', 42
      assert.property simpleTestDoc6, 'date'
      assert.equal simpleTestDoc6.date.toString(), new Date("2014-05-19T16:39:07.536Z").toString()
      assert.propertyVal simpleTestDoc6, 'id2', mongoose.Schema.Types.ObjectId '5303e65d34e1e80d7a7ce212'
      assert.lengthOf simpleTestDoc6.arr, 2
      assert.equal simpleTestDoc6.arr[0], 'alpha'
      assert.equal simpleTestDoc6.arr[1], 'bravo'
      assert.property simpleTestDoc6, 'mix'
      assert.deepEqual simpleTestDoc6.mix, { str: 'A string', bool: false }
      assert.property simpleTestDoc6, 'buf'
      assert.equal simpleTestDoc6.buf.toString(), 'abcdefg'
      assert.propertyVal simpleTestDoc6, 'idx', 'Indexed'
      assert.property simpleTestDoc6, '_id'
      assert.notProperty simpleTestDoc6, '_ct'
      done()

  it 'should return an unencrypted version even if document already decrypted', (done) ->
    simpleTestDoc6.decrypt (err) ->
      assert.equal err, null
      assert.propertyVal simpleTestDoc6, 'text', 'Unencrypted text'
      assert.propertyVal simpleTestDoc6, 'bool', true
      assert.propertyVal simpleTestDoc6, 'num', 42
      assert.property simpleTestDoc6, 'date'
      assert.equal simpleTestDoc6.date.toString(), new Date("2014-05-19T16:39:07.536Z").toString()
      assert.propertyVal simpleTestDoc6, 'id2', mongoose.Schema.Types.ObjectId '5303e65d34e1e80d7a7ce212'
      assert.lengthOf simpleTestDoc6.arr, 2
      assert.equal simpleTestDoc6.arr[0], 'alpha'
      assert.equal simpleTestDoc6.arr[1], 'bravo'
      assert.property simpleTestDoc6, 'mix'
      assert.deepEqual simpleTestDoc6.mix, { str: 'A string', bool: false }
      assert.property simpleTestDoc6, 'buf'
      assert.equal simpleTestDoc6.buf.toString(), 'abcdefg'
      assert.propertyVal simpleTestDoc6, 'idx', 'Indexed'
      assert.property simpleTestDoc6, '_id'
      assert.notProperty simpleTestDoc6, '_ct'
      done()


describe 'document.decryptSync()', ->
  simpleTestDoc7 = null
  before (done) ->
    simpleTestDoc7 = new BasicEncryptedModel
      text: 'Unencrypted text'
      bool: true
      num: 42
      date: new Date '2014-05-19T16:39:07.536Z'
      id2: '5303e65d34e1e80d7a7ce212'
      arr: ['alpha', 'bravo']
      mix: { str: 'A string', bool: false }
      buf: new Buffer 'abcdefg'
      idx: 'Indexed'

    simpleTestDoc7.encrypt (err) ->
      assert.equal err, null
      done()

  after (done) ->
    simpleTestDoc7.remove (err) ->
      assert.equal err, null
      done()

  it 'should return an unencrypted version', (done) ->
    simpleTestDoc7.decryptSync()
    assert.propertyVal simpleTestDoc7, 'text', 'Unencrypted text'
    assert.propertyVal simpleTestDoc7, 'bool', true
    assert.propertyVal simpleTestDoc7, 'num', 42
    assert.property simpleTestDoc7, 'date'
    assert.equal simpleTestDoc7.date.toString(), new Date("2014-05-19T16:39:07.536Z").toString()
    assert.propertyVal simpleTestDoc7, 'id2', mongoose.Schema.Types.ObjectId '5303e65d34e1e80d7a7ce212'
    assert.lengthOf simpleTestDoc7.arr, 2
    assert.equal simpleTestDoc7.arr[0], 'alpha'
    assert.equal simpleTestDoc7.arr[1], 'bravo'
    assert.property simpleTestDoc7, 'mix'
    assert.deepEqual simpleTestDoc7.mix, { str: 'A string', bool: false }
    assert.property simpleTestDoc7, 'buf'
    assert.equal simpleTestDoc7.buf.toString(), 'abcdefg'
    assert.propertyVal simpleTestDoc7, 'idx', 'Indexed'
    assert.property simpleTestDoc7, '_id'
    assert.notProperty simpleTestDoc7, '_ct'
    done()

  it 'should return an unencrypted version even if document already decrypted', (done) ->
    simpleTestDoc7.decryptSync()
    assert.propertyVal simpleTestDoc7, 'text', 'Unencrypted text'
    assert.propertyVal simpleTestDoc7, 'bool', true
    assert.propertyVal simpleTestDoc7, 'num', 42
    assert.property simpleTestDoc7, 'date'
    assert.equal simpleTestDoc7.date.toString(), new Date("2014-05-19T16:39:07.536Z").toString()
    assert.propertyVal simpleTestDoc7, 'id2', mongoose.Schema.Types.ObjectId '5303e65d34e1e80d7a7ce212'
    assert.lengthOf simpleTestDoc7.arr, 2
    assert.equal simpleTestDoc7.arr[0], 'alpha'
    assert.equal simpleTestDoc7.arr[1], 'bravo'
    assert.property simpleTestDoc7, 'mix'
    assert.deepEqual simpleTestDoc7.mix, { str: 'A string', bool: false }
    assert.property simpleTestDoc7, 'buf'
    assert.equal simpleTestDoc7.buf.toString(), 'abcdefg'
    assert.propertyVal simpleTestDoc7, 'idx', 'Indexed'
    assert.property simpleTestDoc7, '_id'
    assert.notProperty simpleTestDoc7, '_ct'
    done()


describe '"fields" option', ->
  it 'should encrypt fields iff they are in the passed in "fields" array even if those fields are indexed', (done) ->
    EncryptedFieldsModelSchema = mongoose.Schema
      text: type: String, index: true
      bool: type: Boolean
      num: type: Number

    EncryptedFieldsModelSchema.plugin encrypt, key: encryptionKey, fields: ['text', 'bool']

    FieldsEncryptedModel = mongoose.model 'Fields', EncryptedFieldsModelSchema

    fieldsEncryptedDoc = new FieldsEncryptedModel
      text: 'Unencrypted text'
      bool: false
      num: 43

    fieldsEncryptedDoc.encrypt (err) ->
      assert.equal err, null
      assert.equal fieldsEncryptedDoc.text, undefined
      assert.equal fieldsEncryptedDoc.bool, undefined
      assert.propertyVal fieldsEncryptedDoc, 'num', 43

      fieldsEncryptedDoc.decrypt (err) ->
        assert.equal err, null
        assert.equal fieldsEncryptedDoc.text, 'Unencrypted text'
        assert.equal fieldsEncryptedDoc.bool, false
        assert.propertyVal fieldsEncryptedDoc, 'num', 43
        done()

  it 'should override other options', (done) ->
    EncryptedFieldsOverrideModelSchema = mongoose.Schema
      text: type: String, index: true
      bool: type: Boolean
      num: type: Number

    EncryptedFieldsOverrideModelSchema.plugin encrypt, key: encryptionKey, fields: ['text', 'bool'], exclude: ['bool']

    FieldsOverrideEncryptedModel = mongoose.model 'FieldsOverride', EncryptedFieldsOverrideModelSchema

    fieldsEncryptedDoc = new FieldsOverrideEncryptedModel
      text: 'Unencrypted text'
      bool: false
      num: 43

    fieldsEncryptedDoc.encrypt (err) ->
      assert.equal err, null
      assert.equal fieldsEncryptedDoc.text, undefined
      assert.equal fieldsEncryptedDoc.bool, undefined
      assert.propertyVal fieldsEncryptedDoc, 'num', 43

      fieldsEncryptedDoc.decrypt (err) ->
        assert.equal err, null
        assert.equal fieldsEncryptedDoc.text, 'Unencrypted text'
        assert.equal fieldsEncryptedDoc.bool, false
        assert.propertyVal fieldsEncryptedDoc, 'num', 43
        done()


describe '"exclude" option', ->
  it 'should encrypt all non-indexed fields except those in the passed-in "exclude" array', (done) ->
    ExcludeEncryptedModelSchema = mongoose.Schema
      text: type: String
      bool: type: Boolean
      num: type: Number
      idx: type: String, index: true

    ExcludeEncryptedModelSchema.plugin encrypt, key: encryptionKey, exclude: ['num']

    ExcludeEncryptedModel = mongoose.model 'Exclude', ExcludeEncryptedModelSchema

    excludeEncryptedDoc = new ExcludeEncryptedModel
      text: 'Unencrypted text'
      bool: false
      num: 43
      idx: 'Indexed'

    excludeEncryptedDoc.encrypt (err) ->
      assert.equal err, null
      assert.equal excludeEncryptedDoc.text, undefined
      assert.equal excludeEncryptedDoc.bool, undefined
      assert.propertyVal excludeEncryptedDoc, 'num', 43
      assert.propertyVal excludeEncryptedDoc, 'idx', 'Indexed'

      excludeEncryptedDoc.decrypt (err) ->
        assert.equal err, null
        assert.equal excludeEncryptedDoc.text, 'Unencrypted text'
        assert.equal excludeEncryptedDoc.bool, false
        assert.propertyVal excludeEncryptedDoc, 'num', 43
        assert.propertyVal excludeEncryptedDoc, 'idx', 'Indexed'
        done()

describe 'Array EmbeddedDocument', ->
  describe 'when only child is encrypted', ->
    before ->
      ChildModelSchema = mongoose.Schema
        text: type: String

      ChildModelSchema.plugin encrypt, key: encryptionKey

      ParentModelSchema = mongoose.Schema
        text: type: String
        children: [ChildModelSchema]

      @ParentModel = mongoose.model 'Parent', ParentModelSchema
      @ChildModel = mongoose.model 'Child', ChildModelSchema

    beforeEach (done) ->
      @parentDoc = new @ParentModel
        text: 'Unencrypted text'

      childDoc = new @ChildModel
        text: 'Child unencrypted text'

      @parentDoc.children.addToSet childDoc

      @parentDoc.save done

    after (done) ->
      @parentDoc.remove done

    describe 'document.save()', ->
      it 'should have decrypted fields', ->
        assert.equal @parentDoc.children[0].text, 'Child unencrypted text'

      it 'should persist children as encrypted', (done) ->
        @ParentModel.find
          _id: @parentDoc._id
          'children._ct': $exists: true
          'children.text': $exists: false
        , (err, docs) ->
          assert.lengthOf docs, 1
          assert.propertyVal docs[0].children[0], 'text', 'Child unencrypted text'
          done()

    describe 'document.find()', ->
      it 'when parent doc found, should pass an unencrypted version of the embedded document to the callback', (done) ->
        @ParentModel.findById @parentDoc._id, (err, doc) ->
          assert.equal err, null
          assert.propertyVal doc, 'text', 'Unencrypted text'
          assert.isArray doc.children
          assert.isObject doc.children[0]
          assert.property doc.children[0], 'text', 'Child unencrypted text'
          assert.property doc.children[0], '_id'
          assert.notProperty doc.children[0], '_ct'
          done()

  describe 'when child and parent are encrypted', ->
    before ->
      ChildModelSchema = mongoose.Schema
        text: type: String

      ChildModelSchema.plugin encrypt, key: encryptionKey

      ParentModelSchema = mongoose.Schema
        text: type: String
        children: [ChildModelSchema]

      ParentModelSchema.plugin encrypt, key: encryptionKey, fields: ['text']

      @ParentModel = mongoose.model 'ParentBoth', ParentModelSchema
      @ChildModel = mongoose.model 'ChildBoth', ChildModelSchema

    beforeEach (done) ->
      @parentDoc = new @ParentModel
        text: 'Unencrypted text'

      childDoc = new @ChildModel
        text: 'Child unencrypted text'

      @parentDoc.children.addToSet childDoc

      @parentDoc.save done

    after (done) ->
      @parentDoc.remove done

    describe 'document.save()', ->
      it 'should have decrypted fields on parent', ->
        assert.equal @parentDoc.text, 'Unencrypted text'

      it 'should have decrypted fields', ->
        assert.equal @parentDoc.children[0].text, 'Child unencrypted text'

      it 'should persist children as encrypted', (done) ->
        @ParentModel.find
          _id: @parentDoc._id
          'children._ct': $exists: true
          'children.text': $exists: false
        , (err, docs) ->
          assert.lengthOf docs, 1
          assert.propertyVal docs[0].children[0], 'text', 'Child unencrypted text'
          done()

    describe 'document.find()', ->
      it 'when parent doc found, should pass an unencrypted version of the embedded document to the callback', (done) ->
        @ParentModel.findById @parentDoc._id, (err, doc) ->
          assert.equal err, null
          assert.propertyVal doc, 'text', 'Unencrypted text'
          assert.isArray doc.children
          assert.isObject doc.children[0]
          assert.property doc.children[0], 'text', 'Child unencrypted text'
          assert.property doc.children[0], '_id'
          assert.notProperty doc.children[0], '_ct'
          done()

  describe 'when entire parent is encrypted', ->
    before ->
      ParentModelSchema = mongoose.Schema
        text: type: String
        children: [text: type: String]

      ParentModelSchema.plugin encrypt, key: encryptionKey

      @ParentModel = mongoose.model 'ParentEntire', ParentModelSchema

    beforeEach (done) ->
      @parentDoc = new @ParentModel
        text: 'Unencrypted text'
        children: [text: 'Child unencrypted text']

      @parentDoc.save done

    after (done) ->
      @parentDoc.remove done

    describe 'document.save()', ->
      it 'should have decrypted fields in document passed to call back', ->
        assert.equal @parentDoc.text, 'Unencrypted text'
        assert.equal @parentDoc.children[0].text, 'Child unencrypted text'

      it 'should persist the entire document as encrypted', (done) ->
        @ParentModel.find
          _id: @parentDoc._id
          '_ct': $exists: true
          'children': $exists: false
          'children.text': $exists: false
        , (err, docs) ->
          assert.lengthOf docs, 1
          assert.propertyVal docs[0], 'text', 'Unencrypted text'
          assert.propertyVal docs[0].children[0], 'text', 'Child unencrypted text'
          done()

    describe 'document.find()', ->
      it 'when parent doc found, should pass an unencrypted version of the embedded document to the callback', (done) ->
        @ParentModel.findById @parentDoc._id, (err, doc) ->
          assert.equal err, null
          assert.propertyVal doc, 'text', 'Unencrypted text'
          assert.isArray doc.children
          assert.isObject doc.children[0]
          assert.property doc.children[0], 'text', 'Child unencrypted text'
          assert.property doc.children[0], '_id'
          assert.notProperty doc.children[0], '_ct'
          done()
