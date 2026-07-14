const fs = require('fs');
const disk = fs.readFileSync('src/pages/user/login/index.tsx', 'utf-8');
const head = fs.readFileSync('../_orig_login.txt', 'utf-8');
console.log('Disk == HEAD:', disk === head);
console.log('Disk length:', disk.length);
console.log('HEAD length:', head.length);
