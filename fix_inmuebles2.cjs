const fs = require('fs');
const path = 'C:\\Users\\bolev\\OneDrive\\Desktop\\CASA LEGAL PLAN\\casaInmobiliaria\\casalegal\\src\\routes\\inmuebles\\[id]\\+page.svelte';
let data = fs.readFileSync(path, 'utf8');

const replacementCard2 = `
					<!-- Agent Card -->
					{#if agente}
						<a href={\`/agentes/\${agente.id}\`} class="block bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 hover:-translate-y-1 transition-transform group cursor-pointer">
							<div class="h-24 bg-brand-green-dark relative">
								<div class="absolute inset-0 bg-brand-gold/10"></div>
							</div>
							<div class="px-8 pb-8 text-center relative">
								<div class="w-24 h-24 mx-auto rounded-full border-4 border-white overflow-hidden -mt-12 bg-brand-green-dark shadow-lg relative z-10 flex items-center justify-center">
									<img src={agente.foto} alt={agente.nombre} class="w-full h-full object-cover" />
								</div>
								<h4 class="text-xl font-serif font-bold text-brand-black mt-4 group-hover:text-brand-gold transition-colors">{agente.nombre}</h4>
								<p class="text-brand-gold text-xs font-bold uppercase tracking-widest mb-4">{agente.rol}</p>
								
                                {#if agente.especialidades}
                                    <p class="text-xs text-gray-500 mb-1 font-bold uppercase">Especialidades: <span class="text-brand-gold font-normal">{agente.especialidades}</span></p>
                                {/if}
                                {#if agente.idiomas}
                                    <p class="text-xs text-gray-500 mb-4 font-bold uppercase">Idiomas: <span class="text-brand-gold font-normal">{agente.idiomas}</span></p>
                                {/if}

								<div class="flex justify-center gap-4 mb-6">
									<button onclick={(e) => { e.preventDefault(); window.location.href=\`tel:\${agente.telefono}\`; }} class="w-10 h-10 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center hover:bg-brand-gold hover:text-white transition-colors z-20 relative">
										<i class="fa-solid fa-phone"></i>
									</button>
								</div>
								<p class="text-sm text-gray-500 font-light border-t border-gray-100 pt-6">El agente designado para brindarte toda la información que necesites sobre este inmueble.</p>
							</div>
						</a>
					{/if}`;

data = data.replace(/<!-- Agent Card -->\s*\{#if agente\}[\s\S]*?\{\/if\}/, replacementCard2);
fs.writeFileSync(path, data);
console.log('Inmuebles fixed.');
