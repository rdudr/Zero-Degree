import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug');
const srcApk = path.join(outDir, 'app-debug.apk');

const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const version = packageJson.version;

async function main() {
  console.log('Syncing Capacitor android assets...');
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execSync(`${npxCmd} cap sync android`, { stdio: 'inherit', cwd: repoRoot });

  console.log('Building Android APK via Gradle...');
  // full, quoted path: the project folder ("Zero Degree") has a space in it
  const androidDir = path.join(repoRoot, 'android');
  const gradlewCmd = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  execSync(`"${gradlewCmd}" assembleDebug`, { stdio: 'inherit', cwd: androidDir });

  if (!fs.existsSync(srcApk)) {
    console.error('Source APK not found at', srcApk);
    process.exit(1);
  }

  // The APK is named version_Zero-Degree.apk
  const destName = `${version}_Zero-Degree.apk`;
  const destPath = path.join(repoRoot, destName); // Saving to root folder instead of deeply nested outDir

  fs.copyFileSync(srcApk, destPath);
  console.log('Exported APK ->', destPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
