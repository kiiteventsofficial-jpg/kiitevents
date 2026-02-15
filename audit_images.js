const fs = require('fs');
const path = require('path');

const EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico'];
const EXCLUDE_DIRS = ['.git', '_unused_images_backup', 'node_modules', '.gemini', ".vscode", "output", "dist"];

function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (!EXCLUDE_DIRS.includes(file)) {
                getAllFiles(filePath, fileList);
            }
        } else {
            fileList.push(filePath);
        }
    });
    return fileList;
}

const allFiles = getAllFiles('.');
const images = allFiles.filter(f => EXTENSIONS.includes(path.extname(f).toLowerCase()));
const others = allFiles.filter(f => !EXTENSIONS.includes(path.extname(f).toLowerCase()));

console.log(`Found ${images.length} images and ${others.length} code files.`);

const unused = [];

images.forEach(img => {
    const filename = path.basename(img);
    let isUsed = false;

    // Check against all other files
    for (const other of others) {
        // Skip huge files to avoid memory issues if any
        try {
            const content = fs.readFileSync(other, 'utf-8');
            if (content.includes(filename)) {
                isUsed = true;
                break;
            }
        } catch (e) { }
    }

    if (!isUsed) {
        unused.push(img);
    }
});

fs.writeFileSync('unused_images_report.json', JSON.stringify(unused, null, 2));
console.log(`Found ${unused.length} unused images. Report saved to unused_images_report.json`);
