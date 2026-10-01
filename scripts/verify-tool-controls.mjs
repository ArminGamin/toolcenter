import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import ts from 'typescript'

const baselinePath = path.resolve('output/tool-interior-controls.json')
const controls = new Set(['input', 'textarea', 'select', 'button', 'SecretInput', 'Field', 'Switch', 'Btn'])
const presentation = new Set(['className', 'style'])
const files = fs.readdirSync('src/components', { recursive: true })
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => path.join('src/components', name))
const inventory = {}
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const signatures = []
  function visit(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && controls.has(node.tagName.getText(source))) {
      const attrs = node.attributes.properties.filter((attr) => !ts.isJsxAttribute(attr) || !presentation.has(attr.name.getText(source)))
        .map((attr) => attr.getText(source).replace(/\s+/g, ' ').trim()).sort()
      signatures.push(crypto.createHash('sha256').update(`${node.tagName.getText(source)}:${attrs.join('|')}`).digest('hex'))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (signatures.length) inventory[file.replaceAll('\\', '/')] = signatures.sort()
}
if (process.argv.includes('--snapshot')) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true })
  fs.writeFileSync(baselinePath, JSON.stringify(inventory, null, 2))
  console.log(`Captured ${Object.values(inventory).flat().length} control signatures across ${Object.keys(inventory).length} files.`)
} else {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  let missing = 0
  for (const [file, signatures] of Object.entries(baseline)) {
    const remaining = [...(inventory[file] || [])]
    for (const signature of signatures) {
      const index = remaining.indexOf(signature)
      if (index < 0) { console.error(`Changed or missing control binding in ${file}`); missing++ }
      else remaining.splice(index, 1)
    }
  }
  if (missing) process.exitCode = 1
  else console.log(`Preserved all ${Object.values(baseline).flat().length} existing control signatures across ${Object.keys(baseline).length} files.`)
}
