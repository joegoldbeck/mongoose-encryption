# Release Notes
## v 0.12.0
- Add authentication
	- Provides defense against attackers with write access
- Prepend version number to ciphertext and authentication code to allow for version detection
	- Makes any future migrations safer and potentially allows them to be done in stages
- Upgrading from previous versions requires migration
