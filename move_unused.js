const fs = require('fs');
const path = require('path');

const report = require('./unused_images_report.json');
const BACKUP_DIR = '_unused_images_backup';

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

report.forEach(filePath => {
    const sourcePath = filePath; // paths in json are relative to root
    if (fs.existsSync(sourcePath)) {
        const destPath = path.join(BACKUP_DIR, filePath);
        const destDir = path.dirname(destPath);

        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        fs.renameSync(sourcePath, destPath);
        console.log(`Moved: ${sourcePath} -> ${destPath}`);
    } else {
        console.log(`File not found (already moved?): ${sourcePath}`);
    }
});

console.log("Move operation completed.");
