const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(filePath));
        } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
            results.push(filePath);
        }
    });
    return results;
}

const files = walk(path.join(__dirname, 'src'));

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Check if alert is used
    if (content.includes('alert(')) {
        // Simple heuristic: if string has "Success", "started", "queued", "saved" use success, else use error
        content = content.replace(/alert\((.*?(?:[Ss]uccess|[Ss]tarted|[Qq]ueued|[Ss]aved).*?)\)/g, 'toast.success($1)');
        content = content.replace(/alert\((.*?)\)/g, 'toast.error($1)');
        
        // Add import
        if (!content.includes("import { toast } from 'sonner'")) {
            // Find last import
            const lastImportIndex = content.lastIndexOf('import ');
            if (lastImportIndex !== -1) {
                const endOfLine = content.indexOf('\n', lastImportIndex);
                content = content.slice(0, endOfLine + 1) + "import { toast } from 'sonner';\n" + content.slice(endOfLine + 1);
            } else {
                content = "import { toast } from 'sonner';\n" + content;
            }
        }
        
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
    }
}
console.log('Done!');
