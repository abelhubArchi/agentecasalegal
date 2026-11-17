const fs = require('fs'); 
const path = 'C:\\Users\\bolev\\OneDrive\\Desktop\\CASA LEGAL PLAN\\casaInmobiliaria\\casalegal\\src\\routes\\inmuebles\\[id]\\+page.svelte'; 
let data = fs.readFileSync(path, 'utf8'); 
data = data.replace('<div class="hidden md:flex flex-col gap-4 row-span-2 overflow-y-auto pr-2">', '<div class="flex flex-row md:flex-col gap-4 md:row-span-2 overflow-x-auto md:overflow-y-auto pr-2 pb-2 md:pb-0 w-full">'); 
data = data.replace(/class=\{\`relative rounded-xl overflow-hidden cursor-pointer flex-shrink-0 h-\[32%\]/g, 'class={`relative rounded-xl overflow-hidden cursor-pointer flex-shrink-0 w-[100px] md:w-auto h-[100px] md:h-[32%]'); 
data = data.replace("import logoImg from '$lib/assets/logoinmo.png';", "import logoImg from '$lib/assets/logoinmo.png';\n\timport Credencial from '$lib/components/Credencial.svelte';"); 
data = data.replace(/rol: realRol\n\s*\};/g, "rol: realRol,\n\t\t\t\t\t\t\tbiografia: md.biografia || ud.biografia || '',\n\t\t\t\t\t\t\tespecialidades: md.especialidades || ud.especialidades || '',\n\t\t\t\t\t\t\tidiomas: md.idiomas || ud.idiomas || '',\n\t\t\t\t\t\t\tredes: md.redes || ud.redes || {}\n\t\t\t\t\t\t};"); 
const rep = `<!-- Agent Card -->
\t\t\t\t\t{#if agente}
\t\t\t\t\t\t<div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 p-4">
\t\t\t\t\t\t\t<Credencial asesor={{
                                nombres: agente.nombre.split(' ')[0],
                                apellidos: agente.nombre.split(' ').slice(1).join(' '),
                                rol: agente.rol.toUpperCase(),
                                foto: agente.foto,
                                departamento: 'Santa Cruz',
                                ciudad: 'Santa Cruz de la Sierra',
                                telefono: agente.whatsapp || agente.telefono
                            }} showButtons={false} />
                            
                            <div class="mt-6 text-center px-4">
                                {#if agente.especialidades}
                                    <p class="text-xs text-gray-500 mb-2 font-bold uppercase">Especialidades: <span class="text-brand-gold font-normal">{agente.especialidades}</span></p>
                                {/if}
                                {#if agente.idiomas}
                                    <p class="text-xs text-gray-500 mb-4 font-bold uppercase">Idiomas: <span class="text-brand-gold font-normal">{agente.idiomas}</span></p>
                                {/if}
                                <div class="flex justify-center gap-4 mb-6">
\t\t\t\t\t\t\t\t\t<a href={\`tel:\${agente.telefono}\`} class="w-10 h-10 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center hover:bg-brand-gold hover:text-white transition-colors">
\t\t\t\t\t\t\t\t\t\t<i class="fa-solid fa-phone"></i>
\t\t\t\t\t\t\t\t\t</a>
\t\t\t\t\t\t\t\t\t<a href={\`/agentes/\${agente.id}\`} class="w-10 h-10 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center hover:bg-brand-gold hover:text-white transition-colors" title="Ver Perfil Completo">
\t\t\t\t\t\t\t\t\t\t<i class="fa-solid fa-user"></i>
\t\t\t\t\t\t\t\t\t</a>
\t\t\t\t\t\t\t\t</div>
                                <p class="text-sm text-gray-500 font-light border-t border-gray-100 pt-6">El agente designado para brindarte toda la información que necesites sobre este inmueble.</p>
                            </div>
\t\t\t\t\t\t</div>
\t\t\t\t\t{/if}`; 
data = data.replace(/<!-- Agent Card -->\s*\{#if agente\}[\s\S]*?\{\/if\}/, rep); 
fs.writeFileSync(path, data); 
console.log('Done.');
