const fs = require('fs');
const path = 'c:\\Users\\EASYSTORE\\marketplace\\client\\src\\pages\\Freelance.jsx';
const lines = fs.readFileSync(path, 'utf8').split('\n');

// Count brackets on each line, ignoring strings and comments roughly
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Simple count of { } ( ) [ ]
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === '[') depth++;
    if (ch === ']') depth--;
  }
  if (depth < 0) {
    console.log(`Line ${i + 1}: NEGATIVE depth ${depth}: ${line.substring(0, 80)}`);
    depth = 0; // reset
  }
}
console.log(`Final depth: ${depth}`);
