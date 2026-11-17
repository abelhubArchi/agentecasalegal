const fs = require('fs');
const path = 'C:\\Users\\bolev\\OneDrive\\Desktop\\CASA LEGAL PLAN\\casaInmobiliaria\\casalegal\\src\\routes\\agentes\\[id]\\+page.svelte';
let data = fs.readFileSync(path, 'utf8');

// 1. Add Credencial import
data = data.replace("import logoImg from '$lib/assets/logoinmo.png';", "import logoImg from '$lib/assets/logoinmo.png';\n\timport Credencial from '$lib/components/Credencial.svelte';");

// 2. Add extra fields
data = data.replace(/bio: mktData\.bio[^}]+}/, "bio: userData.descripcion || userData.biografia || mktData.bio || 'Asesor Inmobiliario comprometido con encontrar tu hogar ideal o la inversión perfecta.',\n\t\t\t\t\tespecialidades: userData.especialidades || mktData.especialidades || '',\n\t\t\t\t\tidiomas: userData.idiomas || mktData.idiomas || '',\n\t\t\t\t\tfotoPortada: userData.fotoPortada || ''\n\t\t\t\t}");

// 3. New UI
const newProfileUI = `<div class="bg-gray-50 min-h-screen pb-24 font-sans selection:bg-brand-gold selection:text-brand-black overflow-x-hidden">
		<!-- Cover Photo Section -->
		<div class="relative w-full h-[280px] md:h-[400px] bg-brand-green-dark overflow-hidden shadow-xl" in:fade={{ duration: 1000 }}>
			{#if agente.fotoPortada}
				<img src={agente.fotoPortada} alt="Portada de {agente.nombres}" class="w-full h-full object-cover opacity-80 mix-blend-overlay scale-105 animate-[pulse_20s_ease-in-out_infinite_alternate]" />
			{:else}
				<div class="absolute inset-0 bg-gradient-to-tr from-brand-black/60 via-brand-gold/20 to-brand-green-dark/90"></div>
				<div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20"></div>
			{/if}
			<div class="absolute bottom-0 left-0 w-full h-2/3 bg-gradient-to-t from-gray-50 to-transparent"></div>
		</div>

		<div class="container mx-auto px-4 lg:px-8 relative z-20">
			<!-- Header Info (Overlapping Profile Pic) -->
			<div class="flex flex-col items-center -mt-32 md:-mt-40 mb-12 text-center" in:fly={{ y: 50, duration: 800, delay: 200 }}>
				<div class="w-40 h-40 md:w-52 md:h-52 rounded-full border-[6px] border-gray-50 shadow-2xl overflow-hidden bg-brand-white group cursor-pointer relative z-20">
					<img src={agente.foto} alt={agente.nombres} class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
					<div class="absolute inset-0 bg-brand-gold/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
				</div>
				
				<div class="mt-4 px-4 z-20">
					<h1 class="text-3xl md:text-5xl font-serif font-bold text-brand-black tracking-tight drop-shadow-md">{agente.nombres} <span class="text-brand-gold">{agente.apellidos}</span></h1>
					<p class="text-gray-500 font-medium italic mt-2 text-lg">"Tu aliado estratégico para inversiones seguras y hogares perfectos"</p>
					
					<!-- Social Networks at the top -->
					<div class="flex justify-center gap-4 mt-6">
						{#if agente.telefono}
							<a href={\`tel:\${agente.telefono}\`} class="w-12 h-12 rounded-full bg-brand-green-dark text-brand-gold flex items-center justify-center hover:-translate-y-1 hover:shadow-lg hover:shadow-brand-green-dark/30 transition-all text-xl" title="Llamar">
								<i class="fa-solid fa-phone"></i>
							</a>
						{/if}
						{#if agente.whatsapp}
							<a href={\`https://wa.me/\${agente.whatsapp.replace(/\\+/g, '')}\`} target="_blank" class="w-12 h-12 rounded-full bg-green-500 text-white flex items-center justify-center hover:-translate-y-1 hover:shadow-lg hover:shadow-green-500/40 transition-all text-xl" title="WhatsApp">
								<i class="fa-brands fa-whatsapp"></i>
							</a>
						{/if}
						{#if agente.facebook}
							<a href={agente.facebook} target="_blank" class="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-600/40 transition-all text-xl" title="Facebook">
								<i class="fa-brands fa-facebook-f"></i>
							</a>
						{/if}
						{#if agente.instagram}
							<a href={agente.instagram} target="_blank" class="w-12 h-12 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 text-white flex items-center justify-center hover:-translate-y-1 hover:shadow-lg transition-all text-xl" title="Instagram">
								<i class="fa-brands fa-instagram"></i>
							</a>
						{/if}
						{#if agente.tiktok}
							<a href={agente.tiktok} target="_blank" class="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center hover:-translate-y-1 hover:shadow-lg transition-all text-xl" title="TikTok">
								<i class="fa-brands fa-tiktok"></i>
							</a>
						{/if}
					</div>
				</div>
			</div>

			<!-- Content Area: Horizontal Alignment (Grid) -->
			<div class="flex flex-col xl:flex-row items-start gap-10">
				
				<!-- Left Column: Credencial -->
				<div class="w-full xl:w-5/12 flex flex-col items-center xl:items-start" in:fly={{ x: -30, duration: 800, delay: 400 }}>
					<div class="sticky top-24 w-full flex justify-center hover:-translate-y-2 transition-transform duration-500 pb-8">
						<Credencial asesor={{
							nombres: agente.nombres.split(' ')[0],
							apellidos: agente.apellidos || agente.nombres.split(' ').slice(1).join(' '),
							rol: 'ASESOR INMOBILIARIO OFICIAL',
							foto: agente.foto,
							departamento: 'Santa Cruz',
							ciudad: 'Santa Cruz de la Sierra',
							telefono: agente.whatsapp || agente.telefono
						}} showButtons={false} />
					</div>
				</div>

				<!-- Right Column: Info & Details -->
				<div class="w-full xl:w-7/12 space-y-8" in:fly={{ x: 30, duration: 800, delay: 600 }}>
					
					<!-- Bio Card -->
					<div class="bg-white rounded-3xl p-8 md:p-10 shadow-xl border border-gray-100 relative overflow-hidden group">
						<i class="fa-solid fa-quote-left absolute -top-4 -left-4 text-8xl text-brand-gold/10 group-hover:text-brand-gold/20 transition-colors"></i>
						<h2 class="text-2xl font-serif font-bold text-brand-black mb-6 relative z-10 flex items-center gap-3">
							Conoce más sobre mí
							<div class="h-1 w-12 bg-brand-gold rounded-full"></div>
						</h2>
						<p class="text-gray-600 font-light leading-relaxed whitespace-pre-wrap text-lg relative z-10">
							{agente.bio}
						</p>
					</div>

					<!-- Details Grid (Side by side) -->
					<div class="flex flex-col md:flex-row gap-8">
						<!-- Especialidades -->
						{#if agente.especialidades}
							<div class="flex-1 bg-gradient-to-br from-white to-gray-50 rounded-3xl p-8 shadow-lg border border-gray-100 hover:border-brand-gold/40 transition-all hover:shadow-xl">
								<h3 class="text-lg font-serif font-bold text-brand-black mb-5 flex items-center gap-2">
									<i class="fa-solid fa-star text-brand-gold"></i> Mis Especialidades
								</h3>
								<div class="flex flex-wrap gap-2">
									{#each agente.especialidades.split(',').map(s => s.trim()).filter(Boolean) as especialidad}
										<span class="bg-brand-gold/10 text-brand-black border border-brand-gold/30 px-4 py-2 rounded-full text-sm font-bold shadow-sm">{especialidad}</span>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Idiomas -->
						{#if agente.idiomas}
							<div class="flex-1 bg-gradient-to-br from-white to-gray-50 rounded-3xl p-8 shadow-lg border border-gray-100 hover:border-brand-green/40 transition-all hover:shadow-xl">
								<h3 class="text-lg font-serif font-bold text-brand-black mb-5 flex items-center gap-2">
									<i class="fa-solid fa-language text-brand-green"></i> Idiomas
								</h3>
								<div class="flex flex-wrap gap-3">
									{#each agente.idiomas.split(',').map(i => i.trim()).filter(Boolean) as idioma}
										<div class="flex items-center gap-2 bg-white shadow-sm border border-gray-200 px-4 py-2 rounded-xl">
											<div class="w-2 h-2 rounded-full bg-brand-green-dark animate-pulse"></div>
											<span class="text-gray-700 font-medium">{idioma}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<!-- Experiencia -->
					{#if agente.experiencia}
						<div class="bg-brand-green-dark rounded-3xl p-8 shadow-2xl text-white overflow-hidden relative group mt-4">
							<div class="absolute top-0 right-0 w-32 h-32 bg-brand-gold/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
							<div class="flex flex-col sm:flex-row items-center justify-between relative z-10 gap-6">
								<div class="flex items-center gap-4">
									<div class="w-16 h-16 rounded-2xl bg-brand-gold/20 flex items-center justify-center backdrop-blur-sm border border-brand-gold/30">
										<i class="fa-solid fa-chart-line text-3xl text-brand-gold"></i>
									</div>
									<div>
										<h3 class="text-sm text-gray-300 font-light uppercase tracking-wider mb-1">Años de Trayectoria</h3>
										<p class="text-3xl font-serif font-bold text-brand-gold">{agente.experiencia}</p>
									</div>
								</div>
								<div class="hidden sm:block w-px h-16 bg-white/20"></div>
								<div class="text-center sm:text-right flex-1">
									<p class="text-sm text-gray-300 font-light italic">"Tu inversión está en manos expertas respaldadas por resultados."</p>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Propiedades Asignadas -->
			<div class="mt-20 pt-16 border-t border-gray-200 relative" in:fade={{ duration: 1000, delay: 800 }}>
				<div class="flex flex-col items-center text-center mb-12">
					<span class="text-brand-gold font-bold uppercase tracking-[0.3em] text-xs mb-3">Portafolio Exclusivo</span>
					<h2 class="text-4xl md:text-5xl font-serif font-bold text-brand-black">Propiedades del Agente</h2>
					<div class="h-1 w-24 bg-brand-green-dark rounded-full mt-6"></div>
				</div>
				
				{#if propiedadesAsignadas.length > 0}
					<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 lg:gap-10">
						{#each propiedadesAsignadas as inmueble}
							<a href={\`/inmuebles/\${inmueble.id}\`} class="block group bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-[0_20px_40px_rgba(0,0,0,0.15)] transition-all duration-500 hover:-translate-y-3 border border-gray-100 flex flex-col cursor-pointer">
								<div class="relative h-72 overflow-hidden flex-shrink-0">
									<img src={inmueble.fotoPrincipal || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80'} alt={inmueble.tituloPropiedad || 'Propiedad'} class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
									<div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300"></div>
									<div class="absolute top-4 left-4 bg-white/90 backdrop-blur-md text-brand-black text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
										<div class="w-2 h-2 rounded-full bg-brand-gold animate-pulse"></div>
										{inmueble.tipoOperacion || 'Venta'}
									</div>
								</div>
								<div class="p-8 flex flex-col flex-grow relative bg-white z-10 -mt-6 rounded-t-3xl shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
									<div class="absolute -top-8 right-6 w-16 h-16 rounded-full bg-brand-green-dark flex items-center justify-center text-brand-gold shadow-xl group-hover:rotate-45 group-hover:scale-110 transition-all duration-300 border-4 border-white">
										<i class="fa-solid fa-arrow-right text-xl"></i>
									</div>
									<p class="text-brand-gold font-bold text-3xl mb-3 tracking-tight">
										{inmueble.moneda === 'BS' || inmueble.moneda === 'BOB' ? 'Bs.' : '$us.'} {inmueble.precioLista ? Number(inmueble.precioLista).toLocaleString() : 'Consultar'}
									</p>
									<h4 class="font-serif text-2xl font-bold text-brand-black mb-3 line-clamp-2 leading-snug">{inmueble.tituloPropiedad || 'Propiedad'}</h4>
									<p class="text-gray-500 text-sm mb-6 flex items-center gap-2 flex-grow">
										<i class="fa-solid fa-location-dot text-gray-400"></i> {inmueble.ciudad || 'Ubicación'}
									</p>
									<div class="flex justify-between items-center pt-5 border-t border-gray-100 text-brand-black text-sm font-bold">
										<span class="flex items-center gap-2" title="Habitaciones"><i class="fa-solid fa-bed text-gray-400"></i> {(inmueble.dormitoriosEstandar || 0) + (inmueble.dormitoriosSuite || 0)}</span>
										<span class="flex items-center gap-2" title="Baños"><i class="fa-solid fa-bath text-gray-400"></i> {inmueble.banosCompletos || 0}</span>
										<span class="flex items-center gap-2" title="Área"><i class="fa-solid fa-vector-square text-gray-400"></i> {inmueble.supConstruida || inmueble.supTerreno || 0} m²</span>
									</div>
								</div>
							</a>
						{/each}
					</div>
				{:else}
					<div class="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm max-w-3xl mx-auto">
						<div class="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
							<i class="fa-solid fa-house-crack text-4xl text-gray-300"></i>
						</div>
						<h3 class="text-2xl font-serif font-bold text-brand-black mb-3">Portafolio en Construcción</h3>
						<p class="text-gray-500 text-lg">Este agente está preparando sus mejores exclusivas para mostrarlas públicamente muy pronto.</p>
					</div>
				{/if}
			</div>
		</div>
	</div>`;

const regex = /<div class="bg-brand-white min-h-screen pt-24 pb-16">[\s\S]*?<!-- Propiedades Asignadas -->[\s\S]*?<\/div>[\s]*<\/div>[\s]*<\/div>/;
data = data.replace(regex, newProfileUI);

fs.writeFileSync(path, data);
console.log('Agent profile redesigned properly.');
