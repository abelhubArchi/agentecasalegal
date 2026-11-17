<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import logo from '$lib/assets/logo.webp';
    import { sidebarOpen } from '$lib/stores/ui.js';
    import { authStore } from '$lib/stores/auth.js';
    import { empresaStore, PRESETS_FIRMAS, generarSlugFirma } from '$lib/stores/empresa.js';
    import { optimizeAndUploadLogo } from '$lib/utils/imageOptimizer.js';
    import { getActiveTenantId } from '$lib/firebase/tenant.js';

    // Get current path to highlight active link
    let currentPath = $derived($page.url.pathname);

    let isAdmin = $derived($authStore.profile?.role === 'admin' || $authStore.profile?.nivelAcceso === 'admin' || $authStore.profile?.rol === 'Administrador');
    let modulos = $derived($authStore.profile?.modulosAccesibles || []);

    // Estado Modal Duplicar App
    let isDuplicarModalOpen = $state(false);
    let pasoDuplicacion = $state('formulario'); // 'formulario' | 'completado'
    let guardandoCopia = $state(false);
    let mensajeExitoCopia = $state('');
    let linkCopiado = $state(false);
    let credsCopiadas = $state(false);
    let showPassword = $state(false);
    let directAdminLink = $state('');
    let isUploadingLogoModal = $state(false);
    let modalLogoInput = $state(null);

    let copiaFirma = $state({
        slug: '',
        nombre: $empresaStore?.nombre || 'CASA LEGAL',
        subtitulo: $empresaStore?.subtitulo || 'Firma Jurídica e Inmobiliaria',
        eslogan: $empresaStore?.eslogan || 'Excelencia, Estrategia y Seguridad Jurídica',
        logoUrl: '',
        moneda: $empresaStore?.moneda || 'Bs.',
        colorPrimario: $empresaStore?.colorPrimario || '#006a39',
        colorSecundario: $empresaStore?.colorSecundario || '#c5a059',
        colorFondo: $empresaStore?.colorFondo || '#f8f9ff',
        colorSidebar: $empresaStore?.colorSidebar || '#1a1d1e',
        telefono: $empresaStore?.telefono || '+591 70000000',
        email: $empresaStore?.email || 'contacto@firma.com',
        ciudad: $empresaStore?.ciudad || 'Santa Cruz, Bolivia'
    });

    // Formulario del Administrador General de la Nueva Firma
    let adminData = $state({
        nombre: 'Dr. Alejandro Torrez',
        cargo: 'Socio Director General',
        email: 'admin@torrezabogados.bo',
        password: '',
        telefono: '+591 71234567'
    });

    function generarPasswordSegura() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
        const firmaWord = (copiaFirma.nombre || 'Lex').replace(/[^a-zA-Z]/g, '').slice(0, 4);
        let randomPart = '';
        for (let i = 0; i < 6; i++) {
            randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        adminData.password = `${firmaWord}#2026!${randomPart}`;
    }

    let deferredPrompt = null;
    let canInstallPWA = $state(false);

    onMount(() => {
        generarPasswordSegura();
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            canInstallPWA = true;
        });
    });

    async function instalarPWA() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                canInstallPWA = false;
            }
            deferredPrompt = null;
        } else {
            alert(`Para instalar ${copiaFirma.nombre || $empresaStore?.nombre || 'la App'}, abre las opciones de tu navegador y selecciona "Instalar aplicación" o "Agregar a la pantalla principal". Se instalará con su logo oficial.`);
        }
    }

    async function handleModalLogoUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        isUploadingLogoModal = true;
        try {
            const targetSlug = copiaFirma.slug || generarSlugFirma(copiaFirma.nombre);
            const res = await optimizeAndUploadLogo(file, { slug: targetSlug });
            copiaFirma.logoUrl = res.url;
        } catch (err) {
            console.error("Error optimizando logo:", err);
            alert("Error al procesar la imagen del logo.");
        } finally {
            isUploadingLogoModal = false;
        }
    }

    function seleccionarPreset(preset) {
        const targetSlug = generarSlugFirma(preset.nombre);
        copiaFirma = {
            ...copiaFirma,
            slug: targetSlug,
            nombre: preset.nombre,
            subtitulo: preset.subtitulo,
            eslogan: preset.eslogan,
            colorPrimario: preset.colorPrimario,
            colorSecundario: preset.colorSecundario,
            colorFondo: preset.colorFondo,
            colorSidebar: preset.colorSidebar,
            moneda: preset.moneda
        };
        const firmaWord = (preset.nombre || 'Lex').replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 8);
        adminData.email = `admin@${targetSlug}.bo`;
        generarPasswordSegura();
    }

    async function aplicarCopiaEnVivo() {
        guardandoCopia = true;
        try {
            if (!adminData.password) {
                generarPasswordSegura();
            }
            if (!copiaFirma.slug) {
                copiaFirma.slug = generarSlugFirma(copiaFirma.nombre);
            }

            const res = await empresaStore.crearFirmaDuplicada(copiaFirma, adminData);

            directAdminLink = res.url;
            pasoDuplicacion = 'completado';
            mensajeExitoCopia = `¡Portal duplicado creado exitosamente en ${res.url}! Base de datos lista desde 0.`;
        } catch(e) {
            console.error("Error al crear firma duplicada:", e);
            alert("Error al aplicar la personalización: " + (e.message || 'Intente de nuevo.'));
        } finally {
            guardandoCopia = false;
        }
    }

    function copiarLinkDirecto() {
        if (!directAdminLink) return;
        navigator.clipboard.writeText(directAdminLink);
        linkCopiado = true;
        setTimeout(() => linkCopiado = false, 2000);
    }

    function copiarCredenciales() {
        const texto = `CREDENTIALS ACCESO:\nPortal: ${copiaFirma.nombre}\nEnlace: ${directAdminLink}\nUsuario / Email: ${adminData.email}\nContraseña: ${adminData.password}\nRol: Administrador General`;
        navigator.clipboard.writeText(texto);
        credsCopiadas = true;
        setTimeout(() => credsCopiadas = false, 2000);
    }

    function canAccess(modulo) {
        if (isAdmin) return true;
        return modulos.includes(modulo);
    }

    function isActive(path, exact = false) {
        if (exact) {
            return currentPath === path;
        }
        return currentPath.startsWith(path) && currentPath !== '/dashboard';
    }

    $effect(() => {
        console.log("Current Profile in Sidebar:", $authStore.profile);
        console.log("isAdmin evaluated as:", isAdmin);
    });
</script>

<aside class="fixed left-0 top-0 h-full w-[260px] bg-[#1A1D1E] shadow-lg flex-col py-lg z-50 transition-transform duration-300 md:translate-x-0 {$sidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex">
    <div class="px-lg mb-xl flex items-center gap-sm">
        <div class="w-12 h-12 bg-white rounded-lg flex items-center justify-center p-1 shrink-0 overflow-hidden shadow-sm">
            <img src={$empresaStore?.logoUrl || logo} alt={$empresaStore?.nombre || "Logo"} class="w-full h-full object-contain" />
        </div>
        <div class="min-w-0">
            <h1 class="text-headline-md font-headline-md font-bold text-secondary-fixed leading-tight truncate">{$empresaStore?.nombre || 'CASA LEGAL'}</h1>
            <p class="text-[10px] font-bold text-tertiary-fixed-dim uppercase tracking-widest mt-1 line-clamp-2">{$empresaStore?.subtitulo || 'Firma Jurídica e Inmobiliaria'}</p>
        </div>
    </div>

    {#if isAdmin}
        <div class="px-md mb-md space-y-2">
            <!-- Acceso directo al Modo Jefe (Presentación Ejecutiva) - Exclusivo Administradores -->
            <a 
                href="/presentacion" 
                class="w-full flex items-center justify-between px-md py-2 rounded-xl border border-[#c5a059]/50 bg-gradient-to-r from-[#c5a059]/20 to-transparent text-[#ffe08e] hover:bg-[#c5a059]/30 transition-all font-bold text-label-sm group shadow-sm"
                title="Presentación a pantalla completa para reuniones con clientes y socios"
            >
                <span class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-[20px] text-[#ffe08e] group-hover:scale-110 transition-transform">co_present</span>
                    <span>Modo Jefe</span>
                </span>
                <span class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#c5a059] text-[#0c1a14] font-mono font-bold">5 LÁMINAS</span>
            </a>

            <!-- Botón Duplicar App - Exclusivo Casa Legal Base Domain y Admin -->
            {#if !getActiveTenantId()}
                <button 
                    type="button"
                    onclick={() => {
                        copiaFirma = {
                            nombre: $empresaStore?.nombre || 'CASA LEGAL',
                            subtitulo: $empresaStore?.subtitulo || 'Firma Jurídica e Inmobiliaria',
                            eslogan: $empresaStore?.eslogan || 'Excelencia, Estrategia y Seguridad Jurídica',
                            moneda: $empresaStore?.moneda || 'Bs.',
                            colorPrimario: $empresaStore?.colorPrimario || '#006a39',
                            colorSecundario: $empresaStore?.colorSecundario || '#c5a059',
                            colorFondo: $empresaStore?.colorFondo || '#f8f9ff',
                            colorSidebar: $empresaStore?.colorSidebar || '#1a1d1e',
                            telefono: $empresaStore?.telefono || '+591 70000000',
                            email: $empresaStore?.email || 'contacto@firma.com',
                            ciudad: $empresaStore?.ciudad || 'Santa Cruz, Bolivia'
                        };
                        isDuplicarModalOpen = true;
                    }}
                    class="w-full bg-gradient-to-r from-primary to-primary/85 text-on-primary font-bold py-2.5 px-3 rounded-xl flex items-center justify-between hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] active:scale-95 transition-all group border border-white/10 shadow-md"
                    title="Duplicar y personalizar el sistema para vender a otra firma jurídica"
                >
                    <span class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-[20px] group-hover:rotate-12 transition-transform">content_copy</span>
                        <span class="text-label-md tracking-tight">Duplicar App</span>
                    </span>
                    <span class="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white font-mono font-bold">
                        Vender
                    </span>
                </button>
            {/if}
        </div>
    {/if}

    <nav class="flex-1 overflow-y-auto px-md space-y-xs custom-scrollbar">
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {currentPath === '/dashboard' ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard">
            <span class="material-symbols-outlined">dashboard</span>
            Dashboard
        </a>
        {#if canAccess('clientes')}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/clientes') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/clientes">
            <span class="material-symbols-outlined">groups</span>
            Clientes
        </a>
        {/if}
        {#if canAccess('casos')}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/casos') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/casos">
            <span class="material-symbols-outlined">folder_open</span>
            Trámites y Casos
        </a>
        {/if}
        {#if canAccess('calendario')}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/calendario') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/calendario">
            <span class="material-symbols-outlined">event</span>
            Calendario
        </a>
        {/if}
        {#if isAdmin}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/equipo') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/equipo">
            <span class="material-symbols-outlined">badge</span>
            Equipo Legal
        </a>
        {/if}
        {#if canAccess('cuentas')}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/cuentas') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/cuentas">
            <span class="material-symbols-outlined">payments</span>
            Bóveda (Flujo)
        </a>
        {/if}
        {#if canAccess('documentos')}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/documentos') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/documentos">
            <span class="material-symbols-outlined">description</span>
            Documentos
        </a>
        {/if}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/chatlegal') || isActive('/dashboard/chatflau') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/chatlegal">
            <span class="material-symbols-outlined {isActive('/dashboard/chatlegal') || isActive('/dashboard/chatflau') ? 'text-secondary-fixed' : ''}">shield</span>
            <span class="truncate">Chat Legal</span>
            <span class="ml-auto text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-secondary/15 text-secondary-fixed border border-secondary/30">SECRETO</span>
        </a>
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md text-amber-300 hover:text-amber-200 hover:bg-amber-400/10 border border-amber-400/20 bg-amber-400/5 mt-1" href="/dashboard/chatlegal?tab=deaddrop">
            <span class="material-symbols-outlined text-amber-400">local_fire_department</span>
            <span class="truncate font-bold">Crear Enlace Seguro</span>
            <span class="ml-auto text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">3s-60s</span>
        </a>
    </nav>
    
    <div class="mt-auto px-md pt-lg border-t border-surface-container-highest/10 space-y-xs">
        <button
            type="button"
            onclick={instalarPWA}
            class="w-full flex items-center gap-md px-md py-sm rounded-lg text-secondary-fixed hover:bg-surface-container-highest/10 transition-all font-label-md text-label-md text-left"
            title="Instalar App Web Oficial de la Firma en este dispositivo"
        >
            <span class="material-symbols-outlined text-[20px]">install_mobile</span>
            Instalar App Web
        </button>

        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/settings') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/settings">
            <span class="material-symbols-outlined">settings</span>
            Configuración
        </a>
        <a class="flex items-center gap-md px-md py-sm rounded-lg {isActive('/dashboard/soporte') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'} transition-all font-label-md text-label-md" href="/dashboard/soporte">
            <span class="material-symbols-outlined">help</span>
            Soporte
        </a>
    </div>
</aside>

<!-- Modal de Duplicación Instantánea de Firma (Marca Blanca para Vender) -->
{#if isDuplicarModalOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 bg-black/75 backdrop-blur-md z-[100] flex items-center justify-center p-3 md:p-6 overflow-y-auto">
        <div class="bg-surface rounded-3xl w-full max-w-4xl shadow-2xl border border-outline-variant overflow-hidden flex flex-col max-h-[92vh]">
            
            <!-- Modal Header -->
            <div class="px-6 py-5 border-b border-outline-variant bg-surface-container-low flex justify-between items-start shrink-0">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#c5a059] text-[#0c1a14] font-mono">
                            VENTA Y MARCA BLANCA
                        </span>
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/10 text-primary border border-primary/20">
                            Multi-Firmas
                        </span>
                    </div>
                    <h3 class="font-bold text-headline-md text-on-surface">
                        Duplicar y Personalizar Sistema para Nueva Firma
                    </h3>
                    <p class="text-xs text-on-surface-variant mt-0.5">
                        Adapta logos, colores, nombre corporativo y moneda para revender esta plataforma a cualquier bufete legal o inmobiliario.
                    </p>
                </div>
                <button
                    onclick={() => isDuplicarModalOpen = false}
                    class="p-2 hover:bg-surface-container rounded-full text-on-surface-variant hover:text-on-surface transition-colors"
                >
                    <span class="material-symbols-outlined text-[22px]">close</span>
                </button>
            </div>

            <!-- Modal Body (Scrollable) -->
            <div class="p-6 overflow-y-auto space-y-6 flex-1">
                
                {#if mensajeExitoCopia}
                    <div class="bg-emerald-50 border border-emerald-400 text-emerald-900 px-4 py-3 rounded-2xl flex items-center gap-3 shadow-md">
                        <span class="material-symbols-outlined text-emerald-600 text-[24px]">verified</span>
                        <span class="font-bold text-sm">{mensajeExitoCopia}</span>
                    </div>
                {/if}

                {#if pasoDuplicacion === 'formulario'}
                    <!-- 1. Presets de Demostración Rápida -->
                    <div>
                        <label class="block text-xs font-bold text-on-surface-variant uppercase mb-2">
                            1. Seleccionar Estilo Preconfigurado para el Cliente
                        </label>
                        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                            {#each PRESETS_FIRMAS as preset}
                                <button
                                    type="button"
                                    onclick={() => seleccionarPreset(preset)}
                                    class="p-3 rounded-2xl border text-left transition-all flex flex-col justify-between {copiaFirma.nombre === preset.nombre ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-outline-variant bg-surface hover:border-primary/50'}"
                                >
                                    <div class="flex items-center gap-1.5 mb-2">
                                        <div class="w-4 h-4 rounded-full border border-black/10 shrink-0" style="background-color: {preset.colorPrimario}"></div>
                                        <div class="w-4 h-4 rounded-full border border-black/10 shrink-0" style="background-color: {preset.colorSecundario}"></div>
                                        <div class="w-4 h-4 rounded-full border border-black/10 shrink-0" style="background-color: {preset.colorSidebar}"></div>
                                    </div>
                                    <div>
                                        <div class="font-bold text-[11px] text-on-surface line-clamp-1">{preset.nombre}</div>
                                        <div class="text-[9px] text-on-surface-variant line-clamp-1">{preset.subtitulo}</div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>

                    <!-- 2. Formulario de la Nueva Firma -->
                    <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm space-y-4">
                        <span class="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[18px]">badge</span>
                            2. Datos Corporativos de la Firma Adquirente
                        </span>

                        <!-- Logotipo Oficial de la Firma Adquirente -->
                        <div class="p-3.5 bg-surface rounded-xl border border-outline-variant space-y-2">
                            <label class="block text-[11px] font-bold text-on-surface-variant uppercase">
                                Logotipo de la Firma (Para Web y App Móvil)
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="w-16 h-16 rounded-xl border border-outline-variant bg-white p-1.5 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                                    {#if copiaFirma.logoUrl}
                                        <img src={copiaFirma.logoUrl} alt="Logo Preview" class="w-full h-full object-contain" />
                                    {:else}
                                        <span class="material-symbols-outlined text-outline text-[28px]">business</span>
                                    {/if}
                                </div>
                                <div class="flex-1 space-y-1.5">
                                    <input
                                        bind:this={modalLogoInput}
                                        type="file"
                                        accept="image/*"
                                        onchange={handleModalLogoUpload}
                                        class="hidden"
                                    />
                                    <div class="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onclick={() => modalLogoInput.click()}
                                            disabled={isUploadingLogoModal}
                                            class="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-bold text-xs hover:opacity-90 transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                                        >
                                            <span class="material-symbols-outlined text-[16px]">upload</span>
                                            <span>{isUploadingLogoModal ? 'Optimizando Logo...' : 'Subir Logotipo'}</span>
                                        </button>
                                        {#if copiaFirma.logoUrl}
                                            <button
                                                type="button"
                                                onclick={() => copiaFirma.logoUrl = ''}
                                                class="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors"
                                            >
                                                Quitar
                                            </button>
                                        {/if}
                                    </div>
                                    <input
                                        type="text"
                                        bind:value={copiaFirma.logoUrl}
                                        placeholder="O pega URL directa de imagen (.png, .webp, .svg)"
                                        class="w-full bg-surface-container border border-outline-variant rounded-lg px-2.5 py-1 text-xs outline-none focus:border-primary"
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- Enlace / Ruta URL Exclusiva del Sistema -->
                        <div class="p-3 bg-surface rounded-xl border border-outline-variant space-y-1">
                            <label class="block text-[11px] font-bold text-on-surface-variant uppercase">
                                Enlace URL Exclusivo del Cliente (Multi-Tenant)
                            </label>
                            <div class="flex items-center gap-1 font-mono text-xs">
                                <span class="text-on-surface-variant shrink-0 bg-surface-container px-2 py-1.5 rounded-lg border border-outline-variant font-bold">
                                    dominio.com/
                                </span>
                                <input
                                    type="text"
                                    bind:value={copiaFirma.slug}
                                    oninput={(e) => {
                                        copiaFirma.slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                                    }}
                                    placeholder="laempresajuridica"
                                    class="flex-1 bg-surface-container border border-outline-variant rounded-lg px-2.5 py-1.5 text-xs font-bold text-primary outline-none focus:border-primary"
                                />
                            </div>
                            <p class="text-[10px] text-on-surface-variant">
                                El cliente y sus empleados ingresarán por este enlace independiente con su logo, y todo el sistema comenzará desde 0.
                            </p>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div class="lg:col-span-2">
                                <label class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">Nombre Comercial de la Firma</label>
                                <input
                                    bind:value={copiaFirma.nombre}
                                    oninput={() => {
                                        if (!copiaFirma.slug || copiaFirma.slug === generarSlugFirma(copiaFirma.nombre.slice(0, -1))) {
                                            copiaFirma.slug = generarSlugFirma(copiaFirma.nombre);
                                        }
                                    }}
                                    type="text"
                                    class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none font-bold"
                                    placeholder="Ej. TORREZ & ASOCIADOS LAW FIRM"
                                />
                            </div>

                            <div>
                                <label class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">Moneda del Sistema</label>
                                <select
                                    bind:value={copiaFirma.moneda}
                                    class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 text-xs focus:border-primary outline-none"
                                >
                                    <option value="Bs.">Bolivianos (Bs.)</option>
                                    <option value="USD">Dólares Americanos ($ / USD)</option>
                                    <option value="EUR">Euros (€ / EUR)</option>
                                    <option value="MXN">Pesos Mexicanos ($ / MXN)</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">Especialidad / Subtítulo</label>
                                <input
                                    bind:value={copiaFirma.subtitulo}
                                    type="text"
                                    class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 text-xs focus:border-primary outline-none"
                                    placeholder="Ej. Bufete Penal & Litigios Corporativos"
                                />
                            </div>

                            <div class="lg:col-span-2">
                                <label class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">Eslogan Institucional</label>
                                <input
                                    bind:value={copiaFirma.eslogan}
                                    type="text"
                                    class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 text-xs focus:border-primary outline-none"
                                    placeholder="Ej. Estrategia Jurídica Inquebrantable"
                                />
                            </div>
                        </div>

                        <!-- Colores Corporativos -->
                        <div class="pt-3 border-t border-outline-variant/60">
                            <div class="text-[11px] font-bold uppercase text-on-surface-variant mb-2">Paleta Cromática de la Marca:</div>
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div class="p-2.5 rounded-xl border border-outline-variant bg-surface flex items-center justify-between">
                                    <div>
                                        <div class="text-[10px] font-bold text-on-surface-variant uppercase">Primario</div>
                                        <div class="font-mono text-xs">{copiaFirma.colorPrimario}</div>
                                    </div>
                                    <input type="color" bind:value={copiaFirma.colorPrimario} class="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent" />
                                </div>

                                <div class="p-2.5 rounded-xl border border-outline-variant bg-surface flex items-center justify-between">
                                    <div>
                                        <div class="text-[10px] font-bold text-on-surface-variant uppercase">Secundario</div>
                                        <div class="font-mono text-xs">{copiaFirma.colorSecundario}</div>
                                    </div>
                                    <input type="color" bind:value={copiaFirma.colorSecundario} class="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent" />
                                </div>

                                <div class="p-2.5 rounded-xl border border-outline-variant bg-surface flex items-center justify-between">
                                    <div>
                                        <div class="text-[10px] font-bold text-on-surface-variant uppercase">Fondo</div>
                                        <div class="font-mono text-xs">{copiaFirma.colorFondo}</div>
                                    </div>
                                    <input type="color" bind:value={copiaFirma.colorFondo} class="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent" />
                                </div>

                                <div class="p-2.5 rounded-xl border border-outline-variant bg-surface flex items-center justify-between">
                                    <div>
                                        <div class="text-[10px] font-bold text-on-surface-variant uppercase">Barra Lateral</div>
                                        <div class="font-mono text-xs">{copiaFirma.colorSidebar}</div>
                                    </div>
                                    <input type="color" bind:value={copiaFirma.colorSidebar} class="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 3. Formulario del Administrador General -->
                    <div class="bg-surface-container-lowest border border-primary/30 rounded-2xl p-5 shadow-sm space-y-4 ring-1 ring-primary/20">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                                3. Cuenta del Administrador General (Dueño de la Firma)
                            </span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                                Acceso Maestro
                            </span>
                        </div>
                        <p class="text-xs text-on-surface-variant">
                            Credenciales con las que el comprador podrá gestionar toda su firma, añadir a sus propios abogados y empleados en <strong>Equipo Legal</strong>, e instalar la Web App con su logo.
                        </p>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">Nombre Completo del Administrador</label>
                                <input
                                    bind:value={adminData.nombre}
                                    type="text"
                                    class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 text-xs focus:border-primary outline-none font-bold"
                                    placeholder="Ej. Dr. Alejandro Torrez"
                                />
                            </div>

                            <div>
                                <label class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">Cargo / Título</label>
                                <input
                                    bind:value={adminData.cargo}
                                    type="text"
                                    class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 text-xs focus:border-primary outline-none"
                                    placeholder="Ej. Socio Director General"
                                />
                            </div>

                            <div>
                                <label class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">Usuario / Email de Acceso</label>
                                <input
                                    bind:value={adminData.email}
                                    type="email"
                                    class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 text-xs focus:border-primary outline-none font-mono font-bold text-primary"
                                    placeholder="admin@firma.bo"
                                />
                            </div>

                            <div>
                                <label class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">Teléfono / WhatsApp</label>
                                <input
                                    bind:value={adminData.telefono}
                                    type="text"
                                    class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 text-xs focus:border-primary outline-none font-mono"
                                    placeholder="+591 71234567"
                                />
                            </div>

                            <div class="sm:col-span-2">
                                <div class="flex items-center justify-between mb-1">
                                    <label class="block text-[11px] font-bold text-on-surface-variant uppercase">Contraseña Maestra Generada</label>
                                    <button
                                        type="button"
                                        onclick={generarPasswordSegura}
                                        class="text-[10px] text-primary hover:underline font-bold flex items-center gap-1"
                                    >
                                        <span class="material-symbols-outlined text-[13px]">autorenew</span>
                                        Regenerar Clave Segura
                                    </button>
                                </div>
                                <div class="flex items-center gap-2">
                                    <div class="relative flex-1">
                                        {#if showPassword}
                                            <input
                                                bind:value={adminData.password}
                                                type="text"
                                                class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 pr-10 text-xs font-mono font-bold tracking-wider outline-none text-emerald-800"
                                            />
                                        {:else}
                                            <input
                                                bind:value={adminData.password}
                                                type="password"
                                                class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 pr-10 text-xs font-mono font-bold tracking-wider outline-none text-emerald-800"
                                            />
                                        {/if}
                                        <button
                                            type="button"
                                            onclick={() => showPassword = !showPassword}
                                            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                                            title={showPassword ? 'Ocultar' : 'Ver'}
                                        >
                                            <span class="material-symbols-outlined text-[18px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onclick={() => {
                                            navigator.clipboard.writeText(adminData.password);
                                            alert("Contraseña copiada al portapapeles");
                                        }}
                                        class="px-3 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                                    >
                                        <span class="material-symbols-outlined text-[15px]">content_copy</span>
                                        Copiar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 4. Previsualización en Vivo de la Marca -->
                    <div class="rounded-2xl border border-outline-variant p-4 overflow-hidden" style="background-color: {copiaFirma.colorFondo}">
                        <div class="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider mb-2">
                            Vista Previa en Vivo de la Identidad para el Comprador
                        </div>
                        <div class="rounded-xl overflow-hidden shadow-lg border border-outline-variant flex flex-col md:flex-row bg-white">
                            <!-- Mini Barra Lateral Simulada -->
                            <div class="w-full md:w-56 p-4 text-white flex flex-col justify-between shrink-0" style="background-color: {copiaFirma.colorSidebar}">
                                <div>
                                    <div class="flex items-center gap-2 mb-2">
                                        {#if copiaFirma.logoUrl}
                                            <img src={copiaFirma.logoUrl} alt="Logo" class="w-8 h-8 object-contain rounded bg-white p-0.5 shadow-xs shrink-0" />
                                        {:else}
                                            <div class="w-8 h-8 rounded bg-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                                                {(copiaFirma.nombre || 'F').slice(0, 1)}
                                            </div>
                                        {/if}
                                        <div class="min-w-0">
                                            <div class="font-bold text-xs tracking-wide text-white leading-tight truncate">{copiaFirma.nombre || 'Tu Firma'}</div>
                                            <div class="text-[8px] text-white/70 uppercase tracking-widest truncate">{copiaFirma.subtitulo || 'Bufete Jurídico'}</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="mt-4 space-y-1">
                                    <div class="text-[10px] px-2 py-1 rounded font-bold" style="background-color: {copiaFirma.colorPrimario}">Dashboard</div>
                                    <div class="text-[10px] px-2 py-1 rounded text-white/60">Trámites y Casos</div>
                                    <div class="text-[10px] px-2 py-1 rounded text-white/60">Bóveda de Caja</div>
                                </div>
                            </div>

                            <!-- Mini Contenido Simulado -->
                            <div class="flex-1 p-4 bg-white flex flex-col justify-between">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <div class="font-serif text-lg font-bold" style="color: {copiaFirma.colorPrimario}">
                                            {copiaFirma.nombre}
                                        </div>
                                        <div class="text-[10px] text-slate-500 italic">"{copiaFirma.eslogan}"</div>
                                    </div>
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono" style="background-color: {copiaFirma.colorSecundario}25; color: {copiaFirma.colorSecundario}">
                                        {copiaFirma.moneda} Activa
                                    </span>
                                </div>

                                <div class="grid grid-cols-2 gap-2 mt-3">
                                    <div class="p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                                        <div class="text-[9px] text-slate-400 font-bold uppercase">Casos Activos</div>
                                        <div class="font-bold text-sm text-slate-800">48 Procesos</div>
                                    </div>
                                    <div class="p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                                        <div class="text-[9px] text-slate-400 font-bold uppercase">Saldo Bóveda</div>
                                        <div class="font-bold text-sm" style="color: {copiaFirma.colorPrimario}">{copiaFirma.moneda} 124,500.00</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                {:else if pasoDuplicacion === 'completado'}
                    <!-- PANTALLA DE ENTREGA AL CLIENTE / LINK DIRECTO GENERADO -->
                    <div class="space-y-6">
                        
                        <div class="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
                            <div>
                                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/20 tracking-wider">
                                    PORTAL DUPLICADO Y LISTO
                                </span>
                                <h3 class="text-xl font-bold mt-1.5">{copiaFirma.nombre}</h3>
                                <p class="text-xs text-emerald-100 mt-0.5">El sistema ha sido configurado con su identidad corporativa, moneda ({copiaFirma.moneda}) y colores oficiales.</p>
                            </div>
                            <span class="material-symbols-outlined text-emerald-200 text-5xl">task_alt</span>
                        </div>

                        <!-- 1. Enlace Directo al Portal del Administrador -->
                        <div class="bg-surface-container-lowest border-2 border-primary/40 rounded-2xl p-5 shadow-md space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[18px]">link</span>
                                    Enlace Directo para el Comprador (Administrador General)
                                </span>
                                <span class="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md font-bold">
                                    ACCESO INMEDIATO
                                </span>
                            </div>
                            <p class="text-xs text-on-surface-variant">
                                Envía este link al nuevo cliente. Al abrirlo, el portal cargará su logotipo, nombre corporativo y el usuario estará pre-cargado listo para ingresar.
                            </p>

                            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <input
                                    type="text"
                                    readonly
                                    value={directAdminLink}
                                    class="flex-1 bg-surface border border-outline-variant rounded-xl py-2.5 px-3 text-xs font-mono select-all text-on-surface outline-none"
                                />
                                <button
                                    type="button"
                                    onclick={copiarLinkDirecto}
                                    class="px-4 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0"
                                >
                                    <span class="material-symbols-outlined text-[16px]">
                                        {linkCopiado ? 'done' : 'content_copy'}
                                    </span>
                                    <span>{linkCopiado ? '¡Copiado!' : 'Copiar Link'}</span>
                                </button>
                                <a
                                    href={directAdminLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="px-4 py-2.5 rounded-xl border border-primary text-primary font-bold text-xs hover:bg-primary/5 transition-all flex items-center justify-center gap-1.5 shrink-0"
                                >
                                    <span class="material-symbols-outlined text-[16px]">open_in_new</span>
                                    Abrir Portal
                                </a>
                            </div>
                        </div>

                        <!-- 2. Credenciales del Administrador General -->
                        <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm space-y-4">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[18px]">badge</span>
                                    Credenciales Oficiales de Entrega
                                </span>
                                <button
                                    type="button"
                                    onclick={copiarCredenciales}
                                    class="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                                >
                                    <span class="material-symbols-outlined text-[15px]">
                                        {credsCopiadas ? 'done' : 'content_copy'}
                                    </span>
                                    {credsCopiadas ? '¡Credenciales Copiadas!' : 'Copiar Credenciales'}
                                </button>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div class="p-3 rounded-xl border border-outline-variant bg-surface">
                                    <span class="text-[10px] uppercase font-bold text-on-surface-variant block mb-0.5">Usuario / Correo Maestro:</span>
                                    <span class="font-mono font-bold text-primary select-all">{adminData.email}</span>
                                </div>
                                <div class="p-3 rounded-xl border border-outline-variant bg-surface">
                                    <span class="text-[10px] uppercase font-bold text-on-surface-variant block mb-0.5">Contraseña Maestra:</span>
                                    <span class="font-mono font-bold text-emerald-800 select-all">{adminData.password}</span>
                                </div>
                                <div class="p-3 rounded-xl border border-outline-variant bg-surface">
                                    <span class="text-[10px] uppercase font-bold text-on-surface-variant block mb-0.5">Titular Asignado:</span>
                                    <span class="font-bold text-on-surface">{adminData.nombre} ({adminData.cargo})</span>
                                </div>
                                <div class="p-3 rounded-xl border border-outline-variant bg-surface">
                                    <span class="text-[10px] uppercase font-bold text-on-surface-variant block mb-0.5">Teléfono / WhatsApp:</span>
                                    <span class="font-mono text-on-surface">{adminData.telefono}</span>
                                </div>
                            </div>
                        </div>

                        <!-- 3. Funciones Clave Habilitadas para el Nuevo Dueño -->
                        <div class="bg-surface-container-low rounded-2xl p-5 border border-outline-variant space-y-3">
                            <span class="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-[18px]">verified_user</span>
                                Capacidades Listas para el Comprador
                            </span>
                            
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                <div class="p-3 rounded-xl bg-surface border border-outline-variant/60 space-y-1">
                                    <div class="font-bold text-primary flex items-center gap-1.5">
                                        <span class="material-symbols-outlined text-[16px]">group_add</span>
                                        Añadir Empleados
                                    </div>
                                    <p class="text-[11px] text-on-surface-variant">
                                        Podrá registrar a sus abogados y colaboradores en <strong>Equipo Legal</strong> (`/dashboard/equipo`) con permisos personalizados.
                                    </p>
                                </div>

                                <div class="p-3 rounded-xl bg-surface border border-outline-variant/60 space-y-1">
                                    <div class="font-bold text-primary flex items-center gap-1.5">
                                        <span class="material-symbols-outlined text-[16px]">install_mobile</span>
                                        Instalar App Web (PWA)
                                    </div>
                                    <p class="text-[11px] text-on-surface-variant">
                                        El cliente podrá instalar la aplicación en su celular o PC; se instalará con el nombre y logotipo oficial de <strong>{copiaFirma.nombre}</strong>.
                                    </p>
                                </div>

                                <div class="p-3 rounded-xl bg-surface border border-outline-variant/60 space-y-1">
                                    <div class="font-bold text-primary flex items-center gap-1.5">
                                        <span class="material-symbols-outlined text-[16px]">shield</span>
                                        Chat Legal Confidencial
                                    </div>
                                    <p class="text-[11px] text-on-surface-variant">
                                        Enlaces efímeros de 3 a 60 segundos, auditoría de dispositivos y protocolo de secreto profesional.
                                    </p>
                                </div>
                            </div>
                        </div>

                    </div>
                {/if}

            </div>

            <!-- Modal Footer -->
            <div class="p-5 border-t border-outline-variant bg-surface-container-low flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
                <button
                    type="button"
                    onclick={() => {
                        isDuplicarModalOpen = false;
                        goto('/dashboard/settings?tab=duplicar');
                    }}
                    class="text-xs font-bold text-primary hover:underline flex items-center gap-1.5"
                >
                    <span class="material-symbols-outlined text-[16px]">open_in_new</span>
                    Abrir Configuración Avanzada de Reventa
                </button>

                <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {#if pasoDuplicacion === 'formulario'}
                        <button
                            type="button"
                            onclick={() => empresaStore.exportarConfiguracionJSON()}
                            class="px-4 py-2.5 rounded-xl border border-outline-variant text-xs font-bold text-on-surface hover:bg-surface-container transition-colors flex items-center gap-1.5"
                            title="Descargar archivo JSON listo para entregar al cliente"
                        >
                            <span class="material-symbols-outlined text-[16px]">file_download</span>
                            Descargar .JSON
                        </button>

                        <button
                            type="button"
                            onclick={aplicarCopiaEnVivo}
                            disabled={guardandoCopia}
                            class="px-5 py-2.5 rounded-xl text-xs font-bold bg-primary text-on-primary hover:opacity-90 transition-all flex items-center gap-1.5 shadow-md"
                        >
                            {#if guardandoCopia}
                                <span class="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                Creando Portal...
                            {:else}
                                <span class="material-symbols-outlined text-[16px]">rocket_launch</span>
                                Crear Portal y Generar Link
                            {/if}
                        </button>
                    {:else}
                        <button
                            type="button"
                            onclick={() => pasoDuplicacion = 'formulario'}
                            class="px-4 py-2.5 rounded-xl border border-outline-variant text-xs font-bold text-on-surface hover:bg-surface-container transition-colors flex items-center gap-1.5"
                        >
                            <span class="material-symbols-outlined text-[16px]">edit</span>
                            Modificar Datos
                        </button>

                        <button
                            type="button"
                            onclick={() => empresaStore.exportarConfiguracionJSON()}
                            class="px-4 py-2.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold hover:opacity-90 transition-all flex items-center gap-1.5 shadow-sm"
                        >
                            <span class="material-symbols-outlined text-[16px]">file_download</span>
                            Descargar Paquete (.JSON)
                        </button>

                        <button
                            type="button"
                            onclick={() => isDuplicarModalOpen = false}
                            class="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:opacity-90 transition-all shadow-md"
                        >
                            Finalizar y Cerrar
                        </button>
                    {/if}
                </div>
            </div>

        </div>
    </div>
{/if}
