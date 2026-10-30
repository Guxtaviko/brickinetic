import assert from 'node:assert/strict'

assert.equal(typeof globalThis.window, 'undefined')
assert.equal(typeof globalThis.document, 'undefined')

const library = await import('../dist/index.js')
assert.equal(typeof library.BrickModel, 'function')
assert.equal('window' in globalThis, false)
assert.equal('document' in globalThis, false)

console.log('Node import succeeded without browser globals or renderer initialization.')
