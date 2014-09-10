mongoose-encryption
==================
Simple encryption for mongoose documents. Relies on the Node `crypto` module. Encryption and decryption happen transparently during save and find. Rather than encrypting fields individually, this plugin takes advantage of the BSON nature of mongoDB documents to encrypt multiple fields at once.


## How it Works

Encryption is performed using `aes-256-cbc` with a random, unique initialization vector for each operation.

To encrypt, the relevant fields are removed from the document, converted to JSON, enciphered in `Buffer` format with the IV prepended, and inserted into the `_ct` field of the document. Mongoose converts the `_ct` field to `Binary` when sending to mongo.

To decrypt, the `_ct` field is deciphered, the JSON is parsed, and the individual fields are inserted back into the document as their original data types.


## Installation

`npm install mongoose-encryption`


## Usage

Generate and store encryption key separately. It should be a 32-byte base64 string. It should probably live in an environment variable, but be sure not to lose it.
A great way to securely generate such a key is `openssl rand -base64 32`

### Basic

By default, all fields are encrypted except for `_id`, `__v`, and fields with indexes

```
var mongoose = require('mongoose');
var encrypt = require('mongoose-encryption');

var userSchema = new mongoose.Schema({
	name: String,
	age: Number
	// whatever else
});

// Add any other plugins or middleware here. For example, middleware for hashing passwords

var encryptionKey = process.env.SOME_32BYTE_BASE64_STRING;

userSchema.plugin(encrypt, { key: encryptionKey });
// This adds a _ct field to the schema, as well as pre 'init' and pre 'save' middleware,
// and encrypt and decrypt instance methods

User = mongoose.model('User', userSchema);
```

And you're all set. You should be able to `find` and make `New` documents as normal, but you should not use the `lean` option on a `find` if you want the document to be decrypted. `findOne`, `findById`, etc..., as well as `save` and `create` also all work as normal. `update` will work fine on unencrypted fields, but will not work correctly if encrypted fields are involved.

### Exclude Certain Fields from Encryption

To exclude additional fields (other than _id and indexed fields), pass the `exclude` option

```
// exclude age from encryption, still encrypt name. _id will also remain unencrypted
userSchema.plugin(encrypt, { key: encryptionKey, exclude: ['age'] });
```

### Encrypt Only Certain Fields

You can also specify exactly which fields to encrypt with the `fields` option. This overrides the defaults and all other options.

```
// encrypt age regardless of any other options. name and _id will be left unencrypted
userSchema.plugin(encrypt, { key: encryptionKey, fields: ['age'] });
```

### Encrypting specific fields of sub-documents

You can even encrypt fields of sub-documents while leaving the parent document otherwise intact, you just need to add it to the subdocument schema.
```
var hidingPlaceSchema = new Schema({
  latitude: Number,
  longitude: Number,
  nickname: String
});

hidingPlaceSchema.plugin(encrypt, {
  key: process.env.KEY,
  exclude: ['nickname']
});

var userSchema = new Schema({
  name: String,
  locationsOfGold: [hidingPlaceSchema]
});

```

### Instance Methods

You can also encrypt and decrypt documents at will (as long as the model includes the plugin).

```
joe = new User ({ name: 'Joe', age: 42 });
joe.encrypt(function(err){
	if (err) return handleError(err);
	console.log(joe.name); // undefined
	console.log(joe.age); // undefined
	console.log(joe._ct); // <Buffer 4a 89 9e df 60 ...

	joe.decrypt(function(err){
		if (err) return handleError(err);
		console.log(joe.name); // Joe
		console.log(joe.age); // 42
		console.log(joe._ct); // undefined
	});
});
```
There is also a `decryptSync` function, which executes synchronously and throws if an error is hit.

## Pros & Cons of Encrypting Multiple Fields at Once

Advantages:
- All Mongoose data types supported via a single code path
- Faster encryption/decryption when working with the entire document
- Smaller encrypted documents

Disadvantages:
- Cannot select individual encrypted fields in a query nor unset or rename encrypted fields via an update operation
- Potentially slower in cases where you only want to decrypt a subset of the document


## Security Notes

- Always store your encryption key outside of version control and separate from your database. An environment variable on your application server works well for this.
- Additionally, store your encryption key offline somewhere safe. If you lose it, there is no way to retrieve your encrypted data.
- Encrypting passwords is no substitute for appropriately hashing them. [bcrypt](https://github.com/ncb000gt/node.bcrypt.js) is one great option. Here's one [nice implementation](http://blog.mongodb.org/post/32866457221/password-authentication-with-mongoose-part-1). Once you've already hashed the password, you may as well encrypt it too. Defense in depth, as they say. Just add the mongoose-encryption plugin to the schema after any hashing middleware.
- If an attacker gains access to your application server, they likely have access to both the database and the key. At that point, encryption does you no good.


## How to Run Unit Tests

0. Install dependencies with `npm install` and [install mongo](http://docs.mongodb.org/manual/installation/) if you don't have it yet
1. Start mongo with `mongod`
2. Run tests with `npm test`


## Security Issue Reporting / Disclaimer

None of the authors are security experts. We relied on accepted tools and practices, and tried hard to make this tool solid and well-tested, but pobody's nerfect. Please look over the code carefully before using it (and note the legal disclaimer below). **If you find or suspect any security-related issues, please email us at security@cinchfinancial.com** and we will get right on it. For non-security-related issues, please open a Github issue or pull request.


## License

The MIT License (MIT)

Copyright (c) 2014 Joseph Goldbeck and Connect Financial, LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
