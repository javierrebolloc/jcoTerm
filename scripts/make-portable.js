const fs = require('fs')
const path = require('path')

const dirOutput = path.join(__dirname, '..', 'release', 'win-unpacked')

if (!fs.existsSync(dirOutput)) {
  console.error('ERROR: release/win-unpacked not found. Run electron-builder --win dir first.')
  process.exit(1)
}

// Create the portable marker file
fs.writeFileSync(path.join(dirOutput, 'portable'), '', 'utf-8')

// Create empty data directory
const dataDir = path.join(dirOutput, 'data')
fs.mkdirSync(dataDir, { recursive: true })

console.log('Portable build ready at: ' + dirOutput)
console.log('  - portable marker created')
console.log('  - data/ directory created')
