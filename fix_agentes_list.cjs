const fs = require('fs');
const path = 'C:\\Users\\bolev\\OneDrive\\Desktop\\CASA LEGAL PLAN\\casaInmobiliaria\\casalegal\\src\\routes\\agentes\\+page.svelte';
let data = fs.readFileSync(path, 'utf8');

data = data.replace(
    "import logoImg from '$lib/assets/logoinmo.png';",
    "import logoImg from '$lib/assets/logoinmo.png';\n\timport Credencial from '$lib/components/Credencial.svelte';"
);

data = data.replace(
    /whatsapp: mkt\.whatsapp \|\| user\.telefono \|\| ''/,
    "whatsapp: mkt.whatsapp || user.telefono || '',\n\t\t\t\t\t\tbiografia: mkt.biografia || user.biografia || mkt.bio || '',\n\t\t\t\t\t\tespecialidades: mkt.especialidades || user.especialidades || '',\n\t\t\t\t\t\tidiomas: mkt.idiomas || user.idiomas || ''"
);

const replacementCard = `
					<a href={\`/agentes/\${agente.id}\`} class="block group flex justify-center transform hover:-translate-y-2 transition-all duration-300">
						<Credencial asesor={{
                            nombres: agente.nombres.split(' ')[0],
                            apellidos: agente.apellidos || agente.nombres.split(' ').slice(1).join(' '),
                            rol: agente.rol === 'ADMIN' ? 'ADMINISTRADOR' : 'ASESOR INMOBILIARIO',
                            foto: agente.foto,
                            departamento: 'Santa Cruz',
                            ciudad: 'Santa Cruz de la Sierra',
                            telefono: agente.whatsapp || agente.telefono
                        }} showButtons={false} />
					</a>
`;

data = data.replace(
    /<a href=\{\`\/agentes\/\$\{agente\.id\}\`\}[\s\S]*?<\/a>/,
    replacementCard
);

fs.writeFileSync(path, data);
console.log('Agentes catalog updated.');
