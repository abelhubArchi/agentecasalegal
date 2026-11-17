const fs = require('fs');
const path = 'C:\\Users\\bolev\\OneDrive\\Desktop\\CASA LEGAL PLAN\\casaInmobiliaria\\casalegal\\src\\lib\\components\\Credencial.svelte';
let data = fs.readFileSync(path, 'utf8');
data = data.replace(/import logoInmo from '\#lib\/assets\/logoinmo\.png';/g, "import logoInmo from '$lib/assets/logoinmo.png';");
fs.writeFileSync(path, data);
console.log('Credencial.svelte fixed.');
