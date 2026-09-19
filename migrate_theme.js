const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts')) results.push(file);
    }
  });
  return results;
}

const files = walk('./apps/calling-saas/src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Regex to find className="..."
  content = content.replace(/className=["']([^"']*)["']/g, (match, classes) => {
    if (classes.includes('text-white')) {
      // Check if it's on a dark/colorful background
      const hasColorfulBg = /bg-(primary|blue|green|red|emerald|rose|indigo|purple|pink)/.test(classes) || classes.includes('btn-primary');
      if (!hasColorfulBg) {
        return `className="${classes.replace(/\btext-white\b/g, 'text-slate-900')}"`;
      }
    }
    return match;
  });
  
  fs.writeFileSync(file, content, 'utf8');
});

console.log('Migration completed');
