# Release Notes
## v 0.13.0
2015-02-21
- Add `decryptPostSave` option
- Implement basic support for nested schemas


## v 0.12.0
2015-02-14
- Add authentication
	- Provides defense against attackers with write access
	- Add `signingKey` option
	- Add `secret` option
    - Rename `key` -> `encryptionKey`
    - Rename `fields` -> `encryptedFields`
    - Rename `exclude` -> `excludeFromEncryption`
	- Add `additionalAuthenticatedFields` option
- Prepend version number to ciphertext and authentication code to allow for version detection
	- Makes any future migrations safer and potentially allows them to be done in stages
	- Requires migration to upgrade from previous versions
		- If you have encrypted subdocuments, first run the class method `migrateSubDocsToA()` on the parent collection
        - Then run the class method `migrateToA()` on any encrypted collections (that are not themselves subdocuments)
