import { spawn } from 'node:child_process'
import { watch } from 'node:fs'

const sourceRoot = new URL('../', import.meta.url)
const testRoot = new URL('./', import.meta.url)
const sourceFile = /\.(?:js|json|html|css)$/
let debounce
let testing = false
let pending = false

function runTests() {
  if (testing) {
    pending = true
    return
  }

  testing = true
  pending = false
  const run = spawn(process.execPath, ['--test', 'tests/*.test.js'], {
    cwd: sourceRoot,
    stdio: 'inherit'
  })
  run.on('error', (error) => console.error('Could not start tests:', error.message))
  run.on('close', () => {
    testing = false
    if (pending) {
      runTests()
    }
  })
}

function rerun() {
  clearTimeout(debounce)
  debounce = setTimeout(runTests, 200)
}

watch(sourceRoot, (_event, file) => {
  if (!file || sourceFile.test(file)) {
    rerun()
  }
})
watch(testRoot, { recursive: true }, rerun)
console.log('Watching source and tests. Press Ctrl+C to stop.')
runTests()
