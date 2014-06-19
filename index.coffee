crypto = require 'crypto'
_ = require 'underscore'

algorithm = 'aes-256-cbc'


# options:
# 	fields - array: explicitly declare which fields to encrypt. overrides other options
# 	exclude - array: exclude certain fields from encryption
module.exports = (schema, options) ->

	if not options.key
		throw new Error 'options.key is required as a 32 byte string'
	key = new Buffer options.key, 'base64'

	# Add necessary fields to schema #
	schema.add _ct: type: Buffer if not schema.paths._ct


	# Determine which fields to encrypt #
	if options.fields
		encryptedFields = _.difference options.fields, ['_ct']
	else
		excludedFields = _.union ['_id', '_ct'], options.exclude
		encryptedFields = []
		for path, details of schema.paths
			if path not in excludedFields and not details._index
				encryptedFields.push path


	# Middleware #
	schema.pre 'init', (next, data) ->
		@decrypt.call data, next # prior to init, the data isn't in the context

	schema.pre 'save', (next) ->
		if @isNew or @isSelected '_ct' # to prevent accidentally overwritting ciphertext in the case 'select' queries are used
			@encrypt next
		else
			next()


	# Instance methods #
	schema.methods.encrypt = (cb) ->
		crypto.randomBytes 16, (err, iv) => # generate initialization vector
			if err
				return cb err
			cipher = crypto.createCipheriv algorithm, key, iv
			objectToEncrypt = _.pick this, encryptedFields
			for field, val of objectToEncrypt
				if val is undefined
					delete objectToEncrypt[field] # don't encrypt undefined fields
				else
					this[field] = undefined # clear unencrypted values of fields that will be encrypted
			jsonToEncrypt = JSON.stringify objectToEncrypt
			cipher.end jsonToEncrypt, 'utf-8', =>
				@_ct = Buffer.concat [iv, cipher.read()]
				cb null

	schema.methods.decrypt = (cb) ->
		if @_ct
			ctWithIV = @_ct.buffer or @_ct # this allows the same function to be used on the data pre-init or post-init
			iv = ctWithIV.slice 0, 16
			ct = ctWithIV.slice 16, ctWithIV.length
			decipher = crypto.createDecipheriv algorithm, key, iv
			decipher.end ct, =>
				decipher.setEncoding 'utf-8'
				try
					unencryptedObject = JSON.parse decipher.read()
				catch err
					return cb 'Error parsing JSON during decrypt of ' + @_id?.toString() + ': ' + err
				for field, decipheredVal of unencryptedObject
					this[field] = decipheredVal
				@_ct = undefined
				cb null
		else
			cb null
