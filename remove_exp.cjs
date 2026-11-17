const fs = require('fs');
const path = 'C:\\Users\\bolev\\OneDrive\\Desktop\\CASA LEGAL PLAN\\casaInmobiliaria\\casalegal\\src\\lib\\components\\Credencial.svelte';
let data = fs.readFileSync(path, 'utf8');

// Use a regular expression that handles potential encoding differences or literal matches
data = data.replace(/<div><small>V[^<]+lida hasta<\/small><span>[^<]+<\/span><\/div>/, '');

fs.writeFileSync(path, data);
console.log('Credencial.svelte expiration removed.');
