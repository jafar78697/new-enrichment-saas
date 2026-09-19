const fs = require('fs');
const files = [
  'apps/calling-saas/src/pages/Signup.tsx',
  'apps/calling-saas/src/pages/PublicPricing.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content
    .replace(/bg-background/g, 'bg-slate-50')
    .replace(/text-text(?!M)/g, 'text-slate-900')
    .replace(/text-textMuted/g, 'text-slate-500')
    .replace(/text-white/g, 'text-slate-900')
    .replace(/bg-surface(\/\d+)?/g, 'bg-white')
    .replace(/border-border(\/\d+)?/g, 'border-slate-200')
    .replace(/bg-primary(\/\d+)?/g, 'bg-blue-600')
    .replace(/text-primary/g, 'text-blue-600')
    .replace(/border-primary(\/\d+)?/g, 'border-blue-600')
    .replace(/ring-primary(\/\d+)?/g, 'ring-blue-600')
    .replace(/from-primary/g, 'from-blue-600')
    .replace(/to-secondary/g, 'to-blue-500')
    .replace(/bg-gradient-to-tr/g, 'bg-blue-600')
    .replace(/glass-card/g, 'bg-white shadow-xl rounded-xl')
    .replace(/theme="filled_black"/g, 'theme="outline"');

  // Fix up specific issues where text-slate-900 on buttons makes them unreadable if bg is blue-600
  content = content.replace(/bg-blue-600(.*?)text-slate-900/g, 'bg-blue-600$1text-white');
  
  // Specific fix for input-field in Signup
  content = content.replace(/className="input-field pl-10"/g, 'className="w-full px-4 py-3 pl-10 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"');
  content = content.replace(/className="input-field"/g, 'className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"');

  fs.writeFileSync(file, content, 'utf8');
});
console.log('Done padding theme');
