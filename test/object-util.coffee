chai = require 'chai'
assert = chai.assert

objectUtil = require('../lib/util/object-util.js')

describe 'getPaths', ->
  it 'should list field names, but not introspect into arrays or buffers', ->
    obj =
      text: 'Unencrypted text'
      bool: true
      num: 42
      arr: [ 'alpha', 'bravo' ]
      mix:
        str: 'A string'
        bool: false
        deeperObj:
          foo: 'bar'
      buf:
        type: 'Buffer'
        data: [ 97, 98, 99, 100, 101, 102, 103 ]
      nothing: null

    assert.deepEqual objectUtil.getPaths(obj).sort(), ['text', 'bool', 'num', 'arr', 'mix.str', 'mix.bool', 'mix.deeperObj.foo', 'buf', 'nothing'].sort()