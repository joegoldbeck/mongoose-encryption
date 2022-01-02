chai = require 'chai'
assert = chai.assert
expect = chai.expect

conflict = require '../lib/util/conflict-util.js'
getExtraData = conflict.getExtraData
includesPath = conflict.includesPath

describe 'conflict', ->
    describe 'includesPath', ->
        it 'should recognize root paths', ->
            expect(includesPath('aa')('aa.bb')).to.be.true
            expect(includesPath('ab')('ab')).to.be.true
            expect(includesPath('a')('a')).to.be.true

        it 'should recognize partial paths', ->
            expect(includesPath('aa')('aa.bb.ccc')).to.be.true
            expect(includesPath('aa.bb')('aa.bb.ccc')).to.be.true
            
        it 'should recognize full paths', ->
            expect(includesPath('aa')('aa')).to.be.true
            expect(includesPath('aa.bb.ccc')('aa.bb.ccc')).to.be.true

        it 'should compare parts by full name', ->
            expect(includesPath('aa.bb')('aa.bbb.ccc')).to.be.false
            expect(includesPath('aa.bb')('aaa.bb.ccc')).to.be.false
            expect(includesPath('aa')('aaa.bb.ccc')).to.be.false

        it 'should recognize within path and not outside', ->
            expect(includesPath('aa.bb.ccc.d')('aa.bb.ccc')).to.be.false
            expect(includesPath('aa.bb.cccc')('aa.bb.ccc')).to.be.false

    describe 'getExtraData', ->
        it 'should allow undefined values', ->
            extraData = getExtraData(['a', 'b', 'c.d', 'e.f.g', 'e.f.h'], {})
            expect(extraData).to.deep.equal({})

        it 'should strip regular data from root', ->
            extraData = getExtraData(['a', 'b', 'c', 'd'], {
                b: 12
                c: []
                d:
                    e: 3
                    f: 4
            })
            expect(extraData).to.deep.equal({})

        it 'should deep strip regular data', ->
            extraData = getExtraData(['a', 'b', 'd.e', 'd.f', 'g.h.i', 'g.j'], {
                b: 12,
                d: 
                    e: 14
                    f: 15
                g:
                    h:
                        i: 5
                    j: 56
            })
            expect(extraData).to.deep.equal({})
            
        it 'should keep extra data in root', ->
            extraData = getExtraData(['a', 'b'], {
                b: 12,
                c: 13,
                d:
                    e: 3
                    f: 4
                e: []
            })
            expect(extraData).to.deep.equal({
                c: 13,
                d:
                    e: 3
                    f: 4
                e: []
            })
            
        it 'should deep keep extra data', ->
            extraData = getExtraData(['a', 'g.k'], {
                d: 
                    e: 14
                    f: 15
                g:
                    h:
                        i: 5
                        j: 6
                    j: 56
            })
            expect(extraData).to.deep.equal({
                d: 
                    e: 14
                    f: 15
                g:
                    h:
                        i: 5
                        j: 6
                    j: 56
            })
            
        it 'should deep keep extra data, but strip regular', ->
            extraData = getExtraData(['a', 'b', 'd.f', 'g.h.i', 'g.l'], {
                b: 12,
                d: 
                    e: 14
                    f: 15
                g:
                    h:
                        i: 5
                        k: 
                            type: 'Buffer'
                            data: '00000001'
                    l: 
                        type: 'Buffer'
                        data: '00000010'
                    m: 12
            })
            expect(extraData).to.deep.equal({
                d: 
                    e: 14
                g:
                    h:
                        k: 
                            type: 'Buffer'
                            data: '00000001'
                    m: 12
            })
            