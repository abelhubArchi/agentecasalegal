const fs = require('fs');

const pathInm = 'C:\\Users\\bolev\\OneDrive\\Desktop\\CASA LEGAL PLAN\\casaInmobiliaria\\casalegal\\src\\routes\\inmuebles\\[id]\\+page.svelte';
let dataInm = fs.readFileSync(pathInm, 'utf8');

// Fix gallery layout
dataInm = dataInm.replace('<div class="hidden md:flex flex-col gap-4 row-span-2 overflow-y-auto pr-2">', '<div class="flex flex-row md:flex-col gap-4 md:row-span-2 overflow-x-auto md:overflow-y-auto pr-2 pb-2 md:pb-0 w-full">');
dataInm = dataInm.replace(/class=\{\`relative rounded-xl overflow-hidden cursor-pointer flex-shrink-0 h-\[32%\]/g, 'class={`relative rounded-xl overflow-hidden cursor-pointer flex-shrink-0 w-[100px] md:w-auto h-[100px] md:h-[32%]');

// Agent fields
dataInm = dataInm.replace(/rol: realRol\n\s*\};/, "rol: realRol,\n\t\t\t\t\t\t\tespecialidades: ud.especialidades || md.especialidades || '',\n\t\t\t\t\t\t\tidiomas: ud.idiomas || md.idiomas || ''\n\t\t\t\t\t\t};");

// Agent card
const oldCardRegex = /<!-- Agent Card -->\s*\{#if agente\}[\s\S]*?\{\/if\}/;
const newCardInm = `<!-- Agent Card -->
\t\t\t\t\t{#if agente}
\t\t\t\t\t\t<a href={\`/agentes/\${agente.id}\`} class="block bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 hover:-translate-y-1 transition-transform group cursor-pointer relative z-10">
\t\t\t\t\t\t\t<div class="h-24 bg-brand-green-dark relative">
\t\t\t\t\t\t\t\t<div class="absolute inset-0 bg-brand-gold/10"></div>
\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t<div class="px-8 pb-8 text-center relative">
\t\t\t\t\t\t\t\t<div class="w-24 h-24 mx-auto rounded-full border-4 border-white overflow-hidden -mt-12 bg-brand-green-dark shadow-lg relative z-10 flex items-center justify-center">
\t\t\t\t\t\t\t\t\t<img src={agente.foto} alt={agente.nombre} class="w-full h-full object-cover" />
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t<h4 class="text-xl font-serif font-bold text-brand-black mt-4 group-hover:text-brand-gold transition-colors">{agente.nombre}</h4>
\t\t\t\t\t\t\t\t<p class="text-brand-gold text-xs font-bold uppercase tracking-widest mb-4">{agente.rol}</p>
\t\t\t\t\t\t\t\t
\t\t\t\t\t\t\t\t{#if agente.especialidades}
\t\t\t\t\t\t\t\t\t<p class="text-xs text-gray-500 mb-1 font-bold uppercase">Especialidades: <span class="text-brand-gold font-normal">{agente.especialidades}</span></p>
\t\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t\t\t{#if agente.idiomas}
\t\t\t\t\t\t\t\t\t<p class="text-xs text-gray-500 mb-4 font-bold uppercase">Idiomas: <span class="text-brand-gold font-normal">{agente.idiomas}</span></p>
\t\t\t\t\t\t\t\t{/if}

\t\t\t\t\t\t\t\t<div class="flex justify-center gap-4 mb-6">
\t\t\t\t\t\t\t\t\t<button onclick={(e) => { e.preventDefault(); window.location.href=\`tel:\${agente.telefono}\`; }} class="w-10 h-10 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center hover:bg-brand-gold hover:text-white transition-colors z-20 relative">
\t\t\t\t\t\t\t\t\t\t<i class="fa-solid fa-phone"></i>
\t\t\t\t\t\t\t\t\t</button>
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t<p class="text-sm text-gray-500 font-light border-t border-gray-100 pt-6">El agente designado para brindarte toda la información que necesites sobre este inmueble.</p>
\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t</a>
\t\t\t\t\t{/if}`;
dataInm = dataInm.replace(oldCardRegex, newCardInm);
fs.writeFileSync(pathInm, dataInm);


// File 2
const pathAg = 'C:\\Users\\bolev\\OneDrive\\Desktop\\CASA LEGAL PLAN\\casaInmobiliaria\\casalegal\\src\\routes\\agentes\\[id]\\+page.svelte';
let dataAg = fs.readFileSync(pathAg, 'utf8');

dataAg = dataAg.replace("import logoImg from '$lib/assets/logoinmo.png';", "import logoImg from '$lib/assets/logoinmo.png';\n\timport Credencial from '$lib/components/Credencial.svelte';");

// Agent fields
dataAg = dataAg.replace(/bio: mktData\.bio[^}]+}/, "bio: userData.descripcion || userData.biografia || mktData.bio || 'Asesor Inmobiliario comprometido con encontrar tu hogar ideal o la inversión perfecta.',\n\t\t\t\t\tespecialidades: userData.especialidades || mktData.especialidades || '',\n\t\t\t\t\tidiomas: userData.idiomas || mktData.idiomas || '',\n\t\t\t\t\tfotoPortada: userData.fotoPortada || ''\n\t\t\t\t}");

// Agent profile UI
const newProfileAg = `<!-- Profile Card -->
\t\t\t<div class="bg-brand-green-dark rounded-3xl overflow-hidden shadow-2xl mb-16 flex flex-col md:flex-row relative" in:fly={{ y: 20, duration: 800 }}>
                {#if agente.fotoPortada}
                    <div class="absolute inset-0 z-0 opacity-20">
                        <img src={agente.fotoPortada} alt="Portada" class="w-full h-full object-cover" />
                    </div>
                {/if}
\t\t\t\t<div class="md:w-2/5 lg:w-1/3 flex justify-center items-center p-8 relative z-10">
\t\t\t\t\t<Credencial asesor={{
                        nombres: agente.nombres.split(' ')[0],
                        apellidos: agente.apellidos || agente.nombres.split(' ').slice(1).join(' '),
                        rol: agente.rol === 'ADMIN' ? 'ADMINISTRADOR' : 'ASESOR INMOBILIARIO',
                        foto: agente.foto,
                        departamento: 'Santa Cruz',
                        ciudad: 'Santa Cruz de la Sierra',
                        telefono: agente.whatsapp || agente.telefono
                    }} showButtons={false} />
\t\t\t\t</div>
\t\t\t\t<div class="md:w-3/5 lg:w-2/3 p-8 lg:p-12 text-brand-white flex flex-col justify-center relative z-10">
\t\t\t\t\t<span class="text-brand-gold uppercase tracking-widest text-xs font-bold mb-2">{agente.rol === 'ADMIN' ? 'Administrador' : 'Agente Inmobiliario'}</span>
\t\t\t\t\t<h1 class="text-4xl md:text-5xl font-serif font-bold mb-4">{agente.nombres} <span class="text-brand-gold">{agente.apellidos}</span></h1>
\t\t\t\t\t
\t\t\t\t\t<p class="text-gray-300 font-light mb-8 max-w-2xl leading-relaxed">
\t\t\t\t\t\t{agente.bio}
\t\t\t\t\t</p>

                    {#if agente.especialidades}
                    <div class="mb-4">
                        <span class="text-brand-gold font-bold uppercase tracking-widest text-xs block mb-1">Especialidades</span>
                        <p class="text-gray-200">{agente.especialidades}</p>
                    </div>
                    {/if}

                    {#if agente.idiomas}
                    <div class="mb-8">
                        <span class="text-brand-gold font-bold uppercase tracking-widest text-xs block mb-1">Idiomas</span>
                        <p class="text-gray-200">{agente.idiomas}</p>
                    </div>
                    {/if}
\t\t\t\t\t
\t\t\t\t\t<div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
\t\t\t\t\t\t{#if agente.telefono}
\t\t\t\t\t\t\t<a href={\`tel:\${agente.telefono}\`} class="flex items-center gap-4 text-gray-300 hover:text-brand-gold transition-colors">
\t\t\t\t\t\t\t\t<div class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-brand-gold">
\t\t\t\t\t\t\t\t\t<i class="fa-solid fa-phone"></i>
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t<span>{agente.telefono}</span>
\t\t\t\t\t\t\t</a>
\t\t\t\t\t\t{/if}
\t\t\t\t\t\t{#if agente.email}
\t\t\t\t\t\t\t<a href={\`mailto:\${agente.email}\`} class="flex items-center gap-4 text-gray-300 hover:text-brand-gold transition-colors">
\t\t\t\t\t\t\t\t<div class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-brand-gold">
\t\t\t\t\t\t\t\t\t<i class="fa-solid fa-envelope"></i>
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t<span>{agente.email}</span>
\t\t\t\t\t\t\t</a>
\t\t\t\t\t\t{/if}
\t\t\t\t\t</div>
\t\t\t\t\t
\t\t\t\t\t<div class="w-full h-px bg-white/10 mb-8"></div>
\t\t\t\t\t
\t\t\t\t\t<div class="flex flex-wrap gap-4 items-center justify-between">
\t\t\t\t\t\t<div class="flex gap-4">
\t\t\t\t\t\t\t{#if agente.whatsapp}
\t\t\t\t\t\t\t\t<a href={\`https://wa.me/\${agente.whatsapp.replace(/\\+/g, '')}\`} target="_blank" class="w-12 h-12 rounded-full bg-brand-gold text-brand-black flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-brand-gold/20" title="WhatsApp">
\t\t\t\t\t\t\t\t\t<i class="fa-brands fa-whatsapp text-xl"></i>
\t\t\t\t\t\t\t\t</a>
\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t\t{#if agente.facebook}
\t\t\t\t\t\t\t\t<a href={agente.facebook} target="_blank" class="w-12 h-12 rounded-full bg-white/10 text-brand-white flex items-center justify-center hover:bg-brand-gold hover:text-brand-black transition-all" title="Facebook">
\t\t\t\t\t\t\t\t\t<i class="fa-brands fa-facebook-f"></i>
\t\t\t\t\t\t\t\t</a>
\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t\t{#if agente.instagram}
\t\t\t\t\t\t\t\t<a href={agente.instagram} target="_blank" class="w-12 h-12 rounded-full bg-white/10 text-brand-white flex items-center justify-center hover:bg-brand-gold hover:text-brand-black transition-all" title="Instagram">
\t\t\t\t\t\t\t\t\t<i class="fa-brands fa-instagram"></i>
\t\t\t\t\t\t\t\t</a>
\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t\t{#if agente.tiktok}
\t\t\t\t\t\t\t\t<a href={agente.tiktok} target="_blank" class="w-12 h-12 rounded-full bg-white/10 text-brand-white flex items-center justify-center hover:bg-brand-gold hover:text-brand-black transition-all" title="TikTok">
\t\t\t\t\t\t\t\t\t<i class="fa-brands fa-tiktok"></i>
\t\t\t\t\t\t\t\t</a>
\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t</div>
\t\t\t\t\t\t
\t\t\t\t\t\t<div class="text-right mt-4 sm:mt-0">
\t\t\t\t\t\t\t<span class="block text-sm text-gray-400">Experiencia</span>
\t\t\t\t\t\t\t<span class="font-bold text-brand-gold">{agente.experiencia}</span>
\t\t\t\t\t\t</div>
\t\t\t\t\t</div>
\t\t\t\t</div>
\t\t\t</div>`;

dataAg = dataAg.replace(/<!-- Profile Card -->[\s\S]*?<!-- Propiedades Asignadas -->/, newProfileAg + '\n\n\t\t\t<!-- Propiedades Asignadas -->');
fs.writeFileSync(pathAg, dataAg);

console.log('All files fixed properly.');
