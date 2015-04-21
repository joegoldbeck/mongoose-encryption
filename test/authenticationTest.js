///BEFORE
var doc = new Document({
    authenticatedField: "Initial Authenticated Data",
    encryptedField: "Initial Encrypted Data",
    _id: new ObjectId()
});

doc.save(done)
var document_id = doc._id;

//TEST
var result1, result2;

Document.find({_id: document_id}).exec()
    .then(function (data1) {
        result1 = data1[0];
        result1.authenticatedField = "New Authenticated Data";

        return Document.find({_id: document_id})
    })
    .then(function (data2) {
        result2 = data2[0];
        result2.encryptedField = "New Encrypted Data";
        return result1.save()
    })
    .then(function () {
        return result2.save()
    })
    .then(function(){
        return Document.find({_id: document_id}).exec()
    })
    .then(function(result){
        assert(result.length === 1);
    });



