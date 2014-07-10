mongoose-encryption
==================
Simple encryption for mongoose documents, relying on the Node `crypto` module. Encryption and decryption happen transparently during save and find (as long as the `lean` option is _not_ used). Rather than encrypting fields individually, this plugin uses the JSON/BSON nature of mongo documents to transparently encrypt several fields at once.


## How it works

To encrypt, the relevant fields are removed from the document, converted to a JSON object, enciphered, and then inserted back into the document in the `_ct` field as a `Buffer` (becomes `Binary` in the db). To decrypt, the `_ct` field is deciphered, the JSON is parsed, and the individual fields are inserted back into the document in their original data types.

Encryption is done using `aes-256-cbc` with a new and random initialization vector (prepended to the ciphertext) for each operation.


## Usage


## Pros & Cons vs encrypting fields individually

Advantages:
- Faster encryption/decryption
- Smaller encrypted documents
- Supports all Mongoose data types with a single code path

Disadvantages:
- Selecting or updating individual encrypted fields via a query is not an option


## How to Run Unit Tests

Unit tests require mocha (`npm install -g mocha`) and mongo

1. Start a mongo process with `mongod`
2. Run tests with `npm test`


## Security issue reporting / Disclaimer

None of the authors are security experts. We relied on accepted tools and practices, and tried hard to make this tool rock solid and well-tested, but pobody's nerfect. We cannot guarantee there are no security holes in this package (see the license below for the legalese)

**If you find any security-related issues, please report them to security@cinchfinancial.com** and we will get on top of it immediately. For non-security-related issues, please open an issue.


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

