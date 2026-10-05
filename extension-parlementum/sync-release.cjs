/**
 * sync-release.cjs
 * Sync build output ke folder release setelah vite build selesai.
 * Dijalankan otomatis oleh: npm run release
 */
const fs   = require('fs');
const path = require('path');

const SRC  = __dirname;                            // extension-parlementum/
const DEST = path.join(SRC, '..', 'extension-parlementum-release');

const FILES_TO_COPY = ['manifest.json', 'background.js', 'interceptor.js'];
const DIRS_TO_COPY  = ['dist', 'icons', 'popup'];

// Bersihkan dan buat ulang folder release
if (fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

// Copy files
for (const file of FILES_TO_COPY) {
    const src = path.join(SRC, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(DEST, file));
    }
}

// Copy folders rekursif
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

for (const dir of DIRS_TO_COPY) {
    const src = path.join(SRC, dir);
    if (fs.existsSync(src)) copyDir(src, path.join(DEST, dir));
}

// Laporan
const size = fs.statSync(path.join(DEST, 'dist', 'content.js')).size;
console.log('');
console.log('✅ Release folder updated!');
console.log('   Folder : ' + DEST);
console.log('   Size   : ' + (size / 1024).toFixed(1) + ' KB');

// Otomatis buat file .zip untuk kemudahan distribusi
try {
    const { execSync } = require('child_process');
    const manifest = JSON.parse(fs.readFileSync(path.join(DEST, 'manifest.json'), 'utf8'));
    const zipName = `parlementum-auto-worker-v${manifest.version || '5.11.0'}.zip`;
    const zipPath = path.join(SRC, '..', zipName);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${DEST}\\*' -DestinationPath '${zipPath}' -Force"`);
    if (fs.existsSync(zipPath)) {
        const zipSize = fs.statSync(zipPath).size;
        console.log('📦 Release ZIP created : ' + zipName + ' (' + (zipSize / 1024).toFixed(1) + ' KB)');
    }
} catch (e) {
    // zip creation optional fallback
}

console.log('');
console.log('👉 Di Opera GX: toggle extension OFF → ON, lalu refresh tab parlamentum.org');
console.log('');
