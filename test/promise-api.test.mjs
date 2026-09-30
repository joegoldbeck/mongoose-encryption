// Promise-based test suite exercising the plugin on Mongoose 6-9.
// Run with: npm run test:promise-api   (expects a MongoDB on localhost, or set MONGODB_URI)
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import encrypt from '../index.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mongoose-encryption-test-promise-api';

const encryptionKey = crypto.randomBytes(32).toString('base64');
const signingKey = crypto.randomBytes(64).toString('base64');
const keys = { encryptionKey, signingKey };
let n = 0;
const model = (def, opts, name = `M${n += 1}`) => {
  const s = new mongoose.Schema(def);
  s.plugin(encrypt, { ...keys, ...opts });
  return mongoose.model(name, s);
};
const rejects = (p, re) => assert.rejects(p, (e) => re.test(e.message));

describe(`mongoose-encryption promise API on mongoose ${mongoose.version}`, function () {
  this.timeout(20000);
  before(async () => { await mongoose.connect(MONGODB_URI); await mongoose.connection.dropDatabase(); });
  after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  it('encrypts all non-indexed fields by default and round-trips', async () => {
    const M = model({ text: String, num: Number, arr: [String], idx: { type: String, index: true } });
    const saved = await new M({ text: 't', num: 2, arr: ['a'], idx: 'i' }).save();
    assert.equal(saved.text, 't'); // decryptPostSave
    const raw = await M.collection.findOne({ _id: saved._id });
    assert.equal(raw.text, undefined); assert.equal(raw.num, undefined); assert.equal(raw.idx, 'i');
    assert.ok(raw._ct); assert.ok(raw._ac);
    const found = await M.findById(saved._id);
    assert.deepEqual([found.text, found.num, found.arr.toObject()], ['t', 2, ['a']]);
    assert.equal(found._ct, undefined); assert.equal(found._ac, undefined);
  });

  it('honours encryptedFields with nested paths and re-encrypts on update', async () => {
    const M = model({ name: String, code: String, nested: { token: String } }, { encryptedFields: ['code', 'nested.token'] });
    const d = await new M({ name: 'n', code: 'c1', nested: { token: 't1' } }).save();
    let raw = await M.collection.findOne({ _id: d._id });
    assert.equal(raw.name, 'n'); assert.equal(raw.code, undefined); assert.equal(raw.nested, undefined);
    const f = await M.findById(d._id); f.code = 'c2'; await f.save();
    raw = await M.collection.findOne({ _id: d._id });
    assert.equal(raw.code, undefined);
    assert.equal((await M.findById(d._id)).code, 'c2');
  });

  it('honours excludeFromEncryption', async () => {
    const M = model({ a: String, b: String }, { excludeFromEncryption: ['b'] });
    const d = await new M({ a: 'a', b: 'b' }).save();
    const raw = await M.collection.findOne({ _id: d._id });
    assert.equal(raw.a, undefined); assert.equal(raw.b, 'b');
  });

  it('detects tampering: _id swap, _ct swap, _ac truncation, authenticated-field edit', async () => {
    const M = model({ text: String, role: String }, { encryptedFields: ['text'], additionalAuthenticatedFields: ['role'] });
    const a = await new M({ text: 'a', role: 'user' }).save();
    const b = await new M({ text: 'b', role: 'user' }).save();
    const rawA = await M.collection.findOne({ _id: a._id });
    const rawB = await M.collection.findOne({ _id: b._id });
    await M.collection.insertOne({ ...rawA, _id: new mongoose.Types.ObjectId() });
    await rejects(M.find({}), /Authentication failed/);
    await M.collection.deleteMany({ _id: { $nin: [a._id, b._id] } });
    await M.collection.updateOne({ _id: a._id }, { $set: { _ct: rawB._ct } });
    await rejects(M.findById(a._id), /Authentication failed/);
    await M.collection.updateOne({ _id: a._id }, { $set: { _ct: rawA._ct, role: 'admin' } });
    await rejects(M.findById(a._id), /Authentication failed/);
    await M.collection.updateOne({ _id: a._id }, { $set: { role: 'user', _ac: rawA._ac.buffer.subarray(0, 10) } });
    await rejects(M.findById(a._id), /_ac is too short/);
    await M.collection.updateOne({ _id: a._id }, { $set: { _ac: rawA._ac } });
    assert.equal((await M.findById(a._id)).text, 'a');
  });

  it('rejects partial selection of authenticated fields, allows none', async () => {
    const M = model({ text: String, role: String }, { encryptedFields: ['text'], additionalAuthenticatedFields: ['role'] });
    const d = await new M({ text: 'a', role: 'r' }).save();
    await rejects(M.findById(d._id).select('role'), /Only some authenticated fields/);
    const none = await M.findById(d._id).select('-_ct -_ac -role');
    assert.equal(none.text, undefined);
    const ct = await M.findById(d._id).select('_ct _ac role');
    assert.equal(ct.text, 'a');
  });

  it('requireAuthenticationCode:false reads legacy unsigned docs; decryptPostSave:false leaves ciphertext', async () => {
    const M = model({ text: String }, { requireAuthenticationCode: false, decryptPostSave: false });
    await M.collection.insertOne({ text: 'legacy' });
    const legacy = await M.findOne({ text: 'legacy' });
    assert.equal(legacy.text, 'legacy');
    const d = await new M({ text: 'x' }).save();
    assert.ok(d._ct); assert.equal(d.text, undefined);
    assert.equal((await M.findById(d._id)).text, 'x');
  });

  it('encrypts embedded documents (array + single nested) and decrypts them after parent save', async () => {
    const Child = new mongoose.Schema({ secret: String, label: String });
    Child.plugin(encrypt, { ...keys, encryptedFields: ['secret'] });
    const Parent = new mongoose.Schema({ kids: [Child], one: Child });
    Parent.plugin(encrypt.encryptedChildren);
    const P = mongoose.model('ParentX', Parent);
    const p = await new P({ kids: [{ secret: 's1', label: 'l1' }], one: { secret: 's2', label: 'l2' } }).save();
    assert.equal(p.kids[0].secret, 's1');
    const raw = await P.collection.findOne({ _id: p._id });
    assert.equal(raw.kids[0].secret, undefined); assert.equal(raw.kids[0].label, 'l1'); assert.ok(raw.kids[0]._ct);
    assert.equal(raw.one.secret, undefined); assert.ok(raw.one._ct);
    const f = await P.findById(p._id);
    assert.equal(f.kids[0].secret, 's1'); assert.equal(f.one.secret, 's2');
    f.kids.push({ secret: 's3', label: 'l3' }); await f.save();
    const raw2 = await P.collection.findOne({ _id: p._id });
    assert.equal(raw2.kids[1].secret, undefined); assert.ok(raw2.kids[1]._ct);
    assert.equal((await P.findById(p._id)).kids[1].secret, 's3');
  });

  it('instance methods work as promises AND with legacy callbacks', async () => {
    const M = model({ text: String }, { middleware: false });
    const d = new M({ text: 'p' });
    await d.encrypt(); assert.ok(d._ct); assert.equal(d.text, undefined);
    await d.sign(); assert.ok(d._ac);
    await d.authenticate(); await d.decrypt(); assert.equal(d.text, 'p');
    await rejects(new M({ _ct: Buffer.from('x') }).encrypt(), /already contains ciphertext/);
    const c = new M({ text: 'cb' });
    await new Promise((res, rej) => c.encrypt((e) => (e ? rej(e) : res())));
    assert.ok(c._ct);
    await new Promise((res, rej) => c.sign((e) => (e ? rej(e) : res())));
    await new Promise((res, rej) => c.authenticate((e) => (e ? rej(e) : res())));
    await new Promise((res, rej) => c.decrypt((e) => (e ? rej(e) : res())));
    assert.equal(c.text, 'cb');
    c._ac = Buffer.from('short');
    const err = await new Promise((res) => c.authenticate((e) => res(e)));
    assert.match(err.message, /_ac is too short/);
  });

  it('migrations: migrateToA, signAll, migrateSubDocsToA (promise and callback)', async () => {
    const def = { text: String };
    const Mig = new mongoose.Schema(def); Mig.plugin(encrypt.migrations, { ...keys, collectionId: 'Mig' });
    const MigModel = mongoose.model('MigA', Mig, 'migcoll');
    await MigModel.collection.insertMany([{ text: 'plain1' }, { text: 'plain2' }]);
    await MigModel.migrateToA();
    const Live = new mongoose.Schema(def); Live.plugin(encrypt, { ...keys, collectionId: 'Mig' });
    const LiveModel = mongoose.model('MigB', Live, 'migcoll');
    assert.deepEqual((await LiveModel.find({}).sort({ text: 1 })).map((x) => x.text), ['plain1', 'plain2']);
    await new Promise((res, rej) => MigModel.migrateToA((e) => (e ? rej(e) : res()))); // idempotent + callback form

    const Unsigned = new mongoose.Schema(def); Unsigned.plugin(encrypt.migrations, { ...keys, collectionId: 'Uns' });
    const UM = mongoose.model('UnsA', Unsigned, 'unscoll');
    const tmp = new UM({ text: 'u' }); await tmp.encrypt(); await UM.collection.insertOne(tmp.toObject());
    await UM.signAll();
    const ULive = new mongoose.Schema(def); ULive.plugin(encrypt, { ...keys, collectionId: 'Uns' });
    assert.equal((await mongoose.model('UnsB', ULive, 'unscoll').findOne({})).text, 'u');

    const Sub = new mongoose.Schema({ s: String }); Sub.plugin(encrypt, { ...keys, middleware: false });
    const Par = new mongoose.Schema({ kids: [Sub] }); Par.plugin(encrypt.migrations, { ...keys, collectionId: 'Par' });
    const PM = mongoose.model('ParMig', Par, 'parcoll');
    await PM.collection.insertOne({ kids: [{ _ct: Buffer.from('legacy-no-version') }] });
    await PM.migrateSubDocsToA('kids');
    const raw = await PM.collection.findOne({});
    assert.equal(raw.kids[0]._ct.buffer.subarray(0, 1).toString(), 'a');
    await rejects(PM.migrateSubDocsToA(42), /must be the name of a field/);
  });

  it('does not emit Buffer() deprecation warnings', async () => {
    const warnings = [];
    const onWarn = (w) => warnings.push(w.message);
    process.on('warning', onWarn);
    const M = model({ text: String });
    await new M({ text: 'w' }).save(); await M.findOne({});
    await new Promise((r) => setImmediate(r));
    process.off('warning', onWarn);
    assert.deepEqual(warnings.filter((w) => /Buffer\(\)/.test(w)), []);
  });
});
