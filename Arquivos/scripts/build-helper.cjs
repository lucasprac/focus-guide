const { spawnSync } = require('node:child_process');
const { mkdirSync, existsSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// Each system has its own helper source. Both write the same lines to stdout (see src/main/behaviour.ts).
let compiler, args;
if (process.platform === 'win32') {
  compiler = process.env.FOCUS_GUIDE_CXX || 'C:\\msys64\\ucrt64\\bin\\g++.exe';
  if (!existsSync(compiler)) throw new Error('MinGW C++ compiler is required to build the Windows helper. Set FOCUS_GUIDE_CXX.');
  args = ['-std=c++17', '-O2', '-Wall', '-Wextra', '-static', '-s', path.join(root, 'native/activity-helper.cpp'), '-o', path.join(root, 'native/bin/activity-helper.exe'), '-luser32'];
} else if (process.platform === 'darwin') {
  // One binary for Apple silicon and Intel. clang++ comes with the Xcode command line tools.
  compiler = process.env.FOCUS_GUIDE_CXX || 'clang++';
  args = ['-std=c++17', '-O2', '-Wall', '-Wextra', '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=11.0', path.join(root, 'native/activity-helper-mac.cpp'), '-o', path.join(root, 'native/bin/activity-helper'), '-framework', 'ApplicationServices', '-framework', 'CoreFoundation'];
} else throw new Error(`The activity helper has no source for ${process.platform}. Focus Guide builds on Windows and macOS.`);
mkdirSync(path.join(root, 'native/bin'), { recursive: true });
const result = spawnSync(compiler, args, { windowsHide: true, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
