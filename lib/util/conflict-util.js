var _ = require('underscore');

var includesPath = function (path) {
    return function (fullPath) {
        return fullPath === path || fullPath.substring(0, path.length + 1) === path + '.';
    }    
}

var getExtraData = (regularFields, object, parentField) => (
    _.omit(
        _.mapObject(object, (value, key) => {
            var field = parentField ? parentField + '.' + key : key;
            if (_.contains(regularFields, field)) {
                return undefined;
            }
            if (!_.isObject(value) || _.isArray(value)) {
                return value;
            }
        
            var isFieldContainer = _.some(regularFields, includesPath(field))
            if (!isFieldContainer) {
                return value;
            }
        
            var subValue = getExtraData(regularFields, value, field);
            
            if (_.isEmpty(subValue)) {
                return undefined;
            } else {
                return subValue;
            }
        }),
        _.isUndefined
    )
);

module.exports = {
    getExtraData,
    includesPath,
}