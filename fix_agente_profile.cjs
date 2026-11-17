const fs = require('fs');
const path = 'C:\\Users\\bolev\\OneDrive\\Desktop\\CASA LEGAL PLAN\\casaInmobiliaria\\casalegal\\src\\routes\\agentes\\[id]\\+page.svelte';
let data = fs.readFileSync(path, 'utf8');

const newProfileUI = `<div class="bg-gray-50 min-h-screen pb-24 font-sans selection:bg-brand-gold selection:text-brand-black">
		<!-- Cover Photo Section -->
		<div class="relative w-full h-[300px] md:h-[450px] bg-brand-green-dark overflow-hidden shadow-xl" in:fade={{ duration: 1000 }}>
			{#if agente.fotoPortada}
				<img src={agente.fotoPortada} alt="Portada de {agente.nombres}" class="w-full h-full object-cover opacity-80 mix-blend-overlay scale-105 animate-[pulse_20s_ease-in-out_infinite_alternate]" />
			{:else}
				<div class="absolute inset-0 bg-gradient-to-tr from-brand-black/60 via-brand-gold/20 to-brand-green-dark/90"></div>
				<div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20"></div>
			{/if}
			<div class="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/60 to-transparent"></div>
		</div>

		<div class="container mx-auto px-4 lg:px-8 relative z-20">
			<!-- Header Info (Overlapping Profile Pic) -->
			<div class="flex flex-col items-center -mt-24 md:-mt-32 mb-16 text-center" in:fly={{ y: 50, duration: 800, delay: 200 }}>
				<div class="w-48 h-48 rounded-full border-[6px] border-white shadow-2xl overflow-hidden bg-brand-white group cursor-pointer relative">
					<img src={agente.foto} alt={agente.nombres} class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
					<div class="absolute inset-0 bg-brand-gold/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
				</div>
				<div class="mt-6 bg-white/80 backdrop-blur-md px-10 py-4 rounded-3xl shadow-lg border border-white/50">
					<h1 class="text-4xl md:text-5xl font-serif font-bold text-brand-black tracking-tight">{agente.nombres} <span class="text-brand-gold">{agente.apellidos}</span></h1>
					<p class="text-brand-green-dark font-bold uppercase tracking-[0.2em] text-sm mt-2">{agente.rol === 'ADMIN' ? 'Administrador' : 'Asesor Inmobiliario'}</p>
				</div>
			</div>

			<!-- Main Content Grid -->
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
				
				<!-- Left Column: Credencial & Contact -->
				<div class="lg:col-span-5 xl:col-span-4 space-y-8" in:fly={{ x: -30, duration: 800, delay: 400 }}>
					<!-- Credencial -->
					<div class="flex justify-center hover:-translate-y-2 transition-transform duration-500">
						<Credencial asesor={{
							nombres: agente.nombres.split(' ')[0],
							apellidos: agente.apellidos || agente.nombres.split(' ').slice(1).join(' '),
							rol: agente.rol === 'ADMIN' ? 'ADMINISTRADOR' : 'ASESOR INMOBILIARIO',
							foto: agente.foto,
							departamento: 'Santa Cruz',
							ciudad: 'Santa Cruz de la Sierra',
							telefono: agente.whatsapp || agente.telefono
						}} showButtons={false} />
					</div>

					<!-- Contact Glass Card -->
					<div class="bg-white rounded-3xl p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-gray-100">
						<h3 class="text-lg font-serif font-bold text-brand-black mb-6 flex items-center gap-2">
							<i class="fa-solid fa-address-book text-brand-gold"></i> Contacto Directo
						</h3>
						<div class="space-y-4">
							{#if agente.telefono}
								<a href={\`tel:\${agente.telefono}\`} class="flex items-center gap-4 group p-3 rounded-xl hover:bg-gray-50 transition-colors">
									<div class="w-12 h-12 rounded-full bg-brand-green-dark/5 flex items-center justify-center text-brand-green-dark group-hover:scale-110 group-hover:bg-brand-gold group-hover:text-white transition-all">
										<i class="fa-solid fa-phone"></i>
									</div>
									<div class="flex-1">
										<p class="text-xs text-gray-400 font-bold uppercase tracking-wider">Teléfono</p>
										<p class="text-brand-black font-medium">{agente.telefono}</p>
									</div>
								</a>
							{/if}
							{#if agente.email}
								<a href={\`mailto:\${agente.email}\`} class="flex items-center gap-4 group p-3 rounded-xl hover:bg-gray-50 transition-colors">
									<div class="w-12 h-12 rounded-full bg-brand-green-dark/5 flex items-center justify-center text-brand-green-dark group-hover:scale-110 group-hover:bg-brand-gold group-hover:text-white transition-all">
										<i class="fa-solid fa-envelope"></i>
									</div>
									<div class="flex-1 overflow-hidden">
										<p class="text-xs text-gray-400 font-bold uppercase tracking-wider">Correo</p>
										<p class="text-brand-black font-medium truncate">{agente.email}</p>
									</div>
								</a>
							{/if}
						</div>
						
						<!-- Social Buttons -->
						<div class="flex justify-center gap-3 mt-8 pt-8 border-t border-gray-100">
							{#if agente.whatsapp}
								<a href={\`https://wa.me/\${agente.whatsapp.replace(/\\+/g, '')}\`} target="_blank" class="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center hover:-translate-y-1 hover:shadow-lg hover:shadow-green-500/30 transition-all" title="WhatsApp">
									<i class="fa-brands fa-whatsapp"></i>
								</a>
							{/if}
							{#if agente.facebook}
								<a href={agente.facebook} target="_blank" class="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-600/30 transition-all" title="Facebook">
									<i class="fa-brands fa-facebook-f"></i>
								</a>
							{/if}
							{#if agente.instagram}
								<a href={agente.instagram} target="_blank" class="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 text-white flex items-center justify-center hover:-translate-y-1 hover:shadow-lg transition-all" title="Instagram">
									<i class="fa-brands fa-instagram"></i>
								</a>
							{/if}
							{#if agente.tiktok}
								<a href={agente.tiktok} target="_blank" class="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center hover:-translate-y-1 hover:shadow-lg transition-all" title="TikTok">
									<i class="fa-brands fa-tiktok"></i>
								</a>
							{/if}
						</div>
					</div>
				</div>

				<!-- Right Column: Bio & Details -->
				<div class="lg:col-span-7 xl:col-span-8 space-y-8" in:fly={{ x: 30, duration: 800, delay: 600 }}>
					<!-- Bio Card -->
					<div class="bg-white rounded-3xl p-8 md:p-10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-gray-100 relative overflow-hidden">
						<i class="fa-solid fa-quote-left absolute -top-4 -left-4 text-8xl text-brand-gold/10 -z-0"></i>
						<h2 class="text-3xl font-serif font-bold text-brand-black mb-6 relative z-10 flex items-center gap-3">
							Acerca de mí
							<div class="h-1 w-12 bg-brand-gold rounded-full"></div>
						</h2>
						<p class="text-gray-600 font-light leading-relaxed whitespace-pre-wrap text-lg relative z-10">
							{agente.bio}
						</p>
					</div>

					<!-- Details Grid -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
						<!-- Especialidades -->
						{#if agente.especialidades}
							<div class="bg-white rounded-3xl p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-gray-100 hover:border-brand-gold/30 transition-colors">
								<h3 class="text-xl font-serif font-bold text-brand-black mb-6 flex items-center gap-2">
									<i class="fa-solid fa-star text-brand-gold"></i> Especialidades
								</h3>
								<div class="flex flex-wrap gap-2">
									{#each agente.especialidades.split(',').map(s => s.trim()).filter(Boolean) as especialidad}
										<span class="bg-brand-gold/10 text-brand-green-dark border border-brand-gold/20 px-4 py-2 rounded-full text-sm font-bold shadow-sm">{especialidad}</span>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Idiomas -->
						{#if agente.idiomas}
							<div class="bg-white rounded-3xl p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-gray-100 hover:border-brand-green/30 transition-colors">
								<h3 class="text-xl font-serif font-bold text-brand-black mb-6 flex items-center gap-2">
									<i class="fa-solid fa-language text-brand-green"></i> Idiomas
								</h3>
								<div class="flex flex-wrap gap-3">
									{#each agente.idiomas.split(',').map(i => i.trim()).filter(Boolean) as idioma}
										<div class="flex items-center gap-2 bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl">
											<div class="w-2 h-2 rounded-full bg-brand-green-dark"></div>
											<span class="text-gray-700 font-medium">{idioma}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
						
						<!-- Experiencia -->
						{#if agente.experiencia}
							<div class="bg-brand-black rounded-3xl p-8 shadow-xl text-white md:col-span-2 overflow-hidden relative group">
								<div class="absolute top-0 right-0 w-32 h-32 bg-brand-gold/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
								<div class="flex flex-col sm:flex-row items-center justify-between relative z-10 gap-6">
									<div class="flex items-center gap-4">
										<div class="w-16 h-16 rounded-2xl bg-brand-gold/20 flex items-center justify-center">
											<i class="fa-solid fa-briefcase text-3xl text-brand-gold"></i>
										</div>
										<div>
											<h3 class="text-lg text-gray-400 font-light">Experiencia en el sector</h3>
											<p class="text-3xl font-serif font-bold text-brand-gold">{agente.experiencia}</p>
										</div>
									</div>
									<div class="hidden sm:block w-px h-16 bg-white/10"></div>
									<div class="text-center sm:text-right">
										<p class="text-sm text-gray-400 max-w-xs font-light">Un profesional capacitado y respaldado por la extensa red de Casa Legal Inmobiliaria.</p>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Propiedades Asignadas -->
			<div class="mt-24 pt-16 border-t border-gray-200" in:fade={{ duration: 1000, delay: 800 }}>
				<div class="flex justify-between items-end mb-10">
					<div>
						<span class="text-brand-gold font-bold uppercase tracking-widest text-sm block mb-2">Exclusivas</span>
						<h2 class="text-4xl font-serif font-bold text-brand-black">Propiedades de este Agente</h2>
					</div>
					<div class="hidden md:block">
						<div class="h-1 w-24 bg-brand-green-dark rounded-full"></div>
					</div>
				</div>
				
				{#if propiedadesAsignadas.length > 0}
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
						{#each propiedadesAsignadas as inmueble}
							<a href={\`/inmuebles/\${inmueble.id}\`} class="block group bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-[0_20px_40px_rgba(0,0,0,0.12)] transition-all duration-500 hover:-translate-y-2 border border-gray-100 flex flex-col cursor-pointer">
								<div class="relative h-64 overflow-hidden flex-shrink-0">
									<img src={inmueble.fotoPrincipal || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80'} alt={inmueble.tituloPropiedad || 'Propiedad'} class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
									<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
									<div class="absolute top-4 right-4 bg-brand-gold text-brand-black text-xs font-bold px-4 py-1.5 uppercase tracking-wider rounded-full shadow-md">
										{inmueble.tipoOperacion || 'Venta'}
									</div>
								</div>
								<div class="p-6 flex flex-col flex-grow relative">
									<div class="w-12 h-12 rounded-full bg-brand-green-dark absolute -top-6 right-6 flex items-center justify-center text-brand-gold shadow-lg group-hover:scale-110 transition-transform">
										<i class="fa-solid fa-arrow-right"></i>
									</div>
									<p class="text-brand-green-dark font-bold text-2xl mb-2">
										{inmueble.moneda === 'BS' || inmueble.moneda === 'BOB' ? 'Bs.' : '$us.'} {inmueble.precioLista ? Number(inmueble.precioLista).toLocaleString() : 'Consultar'}
									</p>
									<h4 class="font-serif text-xl font-bold text-brand-black mb-2 line-clamp-2">{inmueble.tituloPropiedad || 'Propiedad'}</h4>
									<p class="text-gray-500 text-sm mb-6 flex items-center gap-2 flex-grow">
										<i class="fa-solid fa-location-dot text-brand-gold"></i> {inmueble.ciudad || 'Ubicación'}
									</p>
									<div class="flex justify-between items-center p-4 bg-gray-50 rounded-xl text-gray-600 text-sm font-medium">
										<span class="flex items-center gap-2" title="Habitaciones"><i class="fa-solid fa-bed text-brand-gold"></i> {(inmueble.dormitoriosEstandar || 0) + (inmueble.dormitoriosSuite || 0)}</span>
										<div class="w-px h-4 bg-gray-300"></div>
										<span class="flex items-center gap-2" title="Baños"><i class="fa-solid fa-bath text-brand-gold"></i> {inmueble.banosCompletos || 0}</span>
										<div class="w-px h-4 bg-gray-300"></div>
										<span class="flex items-center gap-2" title="Área"><i class="fa-solid fa-vector-square text-brand-gold"></i> {inmueble.supConstruida || inmueble.supTerreno || 0} m²</span>
									</div>
								</div>
							</a>
						{/each}
					</div>
				{:else}
					<div class="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
						<div class="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
							<i class="fa-solid fa-house-crack text-4xl text-gray-300"></i>
						</div>
						<h3 class="text-xl font-bold text-brand-black mb-2">Sin propiedades exclusivas</h3>
						<p class="text-gray-500">Este agente aún no tiene propiedades exclusivas asignadas en su portafolio público.</p>
					</div>
				{/if}
			</div>
		</div>
	</div>`;

const regex = /<div class="bg-brand-white min-h-screen pt-24 pb-16">[\s\S]*?<!-- Propiedades Asignadas -->[\s\S]*?<\/div>[\s]*<\/div>[\s]*<\/div>/;
data = data.replace(regex, newProfileUI);

fs.writeFileSync(path, data);
console.log('Agent profile redesigned successfully.');
