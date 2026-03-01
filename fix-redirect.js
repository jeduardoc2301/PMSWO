const fs = require('fs');
const path = 'app/[locale]/auth/signin/page.tsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace("router.push('/dashboard')", "router.push('/es/dashboard')");
fs.writeFileSync(path, content);
console.log('File updated successfully');
