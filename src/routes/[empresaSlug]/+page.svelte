<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { db, auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '$lib/firebase/client.js';
    import { doc, setDoc } from 'firebase/firestore';
    import { empresaStore, DEFAULT_EMPRESA } from '$lib/stores/empresa.js';
    import { setActiveTenantId } from '$lib/firebase/tenant.js';
    import { updateBrowserIcons } from '$lib/utils/imageOptimizer.js';
    import { fade, fly } from 'svelte/transition';
    import logoDefault from '$lib/assets/logo.webp';

    let empresaSlug = $derived($page.params.empresaSlug);

    let firma = $state(null);
    let cargandoFirma = $state(true);
    let firmaNoEncontrada = $state(false);

    let email = $state('');
    let password = $state('');
    let errorMsg = $state('');
    let isLoading = $state(false);
    let mostrarCredenciales = $state(false);
    let deferredPrompt = null;
    let canInstall = $state(false);

    onMount(async () => {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            canInstall = true;
        });

        if (empresaSlug) {
            cargandoFirma = true;
            try {
                const data = await empresaStore.cargarFirmaPorSlug(empresaSlug);
                if (data) {
                    firma = data;
                    setActiveTenantId(empresaSlug);
                    if (data.logoUrl) {
                        updateBrowserIcons(data.logoUrl);
                    }
                    if (data.administradorGeneral?.email) {
                        const emailParam = $page.url.searchParams.get('loginEmail') || data.administradorGeneral.email;
                        email = emailParam;
                    }
                    if (data.administradorGeneral?.password) {
                        mostrarCredenciales = true;
                    }
                } else {
                    firmaNoEncontrada = true;
                }
            } catch (e) {
                console.error("Error al cargar portal de firma:", e);
                firmaNoEncontrada = true;
            } finally {
                cargandoFirma = false;
            }
        }
    });

    async function handleLogin(e) {
        if (e) e.preventDefault();
        const inputVal = email ? email.trim() : '';
        const inputPass = password ? password.trim() : '';
        if (!inputVal || !inputPass) {
            errorMsg = 'Ingresa tu usuario / correo y contraseña.';
            return;
        }
        errorMsg = '';
        isLoading = true;

        try {
            const adminEmailDef = (firma?.administradorGeneral?.email || '').trim();
            const adminPassDef = (firma?.administradorGeneral?.password || '').trim();
            const adminAuthEmail = (firma?.administradorGeneral?.authEmail || '').trim();
            const cleanSlugId = (empresaSlug || 'firma').toLowerCase().replace(/[^a-z0-9]/g, '');
            const fallbackTechEmail = adminAuthEmail || `admin_${cleanSlugId}@firma.casalegal.system`;

            // 1. Determinar lista de correos candidatos para intentar autenticar
            const isMatchAdminEmail = adminEmailDef && (
                inputVal.toLowerCase() === adminEmailDef.toLowerCase() ||
                inputVal.toLowerCase() === 'admin' ||
                inputVal.toLowerCase() === adminEmailDef.split('@')[0].toLowerCase()
            );

            let emailsToTry = [];
            if (isMatchAdminEmail) {
                if (adminAuthEmail) emailsToTry.push(adminAuthEmail);
                if (adminEmailDef) emailsToTry.push(adminEmailDef);
                emailsToTry.push(fallbackTechEmail);
            } else {
                emailsToTry.push(inputVal);
                if (!inputVal.includes('@')) {
                    emailsToTry.push(`${inputVal}@${empresaSlug || 'casalegal'}.com`);
                }
            }

            let loggedUser = null;

            // Intentar signIn estándar con los candidatos
            for (const tryEmail of emailsToTry) {
                try {
                    const cred = await signInWithEmailAndPassword(auth, tryEmail, inputPass);
                    loggedUser = cred.user;
                    break;
                } catch (signInErr) {
                    // Continuar al siguiente candidato
                }
            }

            // 2. Si falló el login y la contraseña coincide con la generada para la firma:
            const isMasterPassMatch = adminPassDef && (inputPass === adminPassDef);
            if (!loggedUser && (isMatchAdminEmail || inputVal.toLowerCase() === 'admin') && isMasterPassMatch) {
                // El usuario aún no fue creado en Firebase Auth. Aprovisionarlo en vivo:
                const emailsToCreate = [fallbackTechEmail, adminEmailDef].filter(Boolean);
                for (const autoEmail of emailsToCreate) {
                    try {
                        const cred = await createUserWithEmailAndPassword(auth, autoEmail, inputPass);
                        loggedUser = cred.user;
                        break;
                    } catch (createErr) {
                        if (createErr.code === 'auth/email-already-in-use') {
                            try {
                                const cred = await signInWithEmailAndPassword(auth, autoEmail, inputPass);
                                loggedUser = cred.user;
                                break;
                            } catch(e) {}
                        }
                    }
                }
            }

            // 3. Si se completó la autenticación con éxito
            if (loggedUser) {
                try {
                    const adminDocData = {
                        authUid: loggedUser.uid,
                        name: firma?.administradorGeneral?.nombre || 'Administrador General',
                        nombre: firma?.administradorGeneral?.nombre || 'Administrador General',
                        cargo: firma?.administradorGeneral?.cargo || 'Socio Director',
                        title: firma?.administradorGeneral?.cargo || 'Socio Director',
                        email: adminEmailDef || inputVal,
                        rol: 'Administrador',
                        role: 'admin',
                        nivelAcceso: 'admin',
                        empresaId: empresaSlug,
                        empresaSlug: empresaSlug,
                        empresaNombre: firma?.nombre || empresaSlug,
                        estado: 'Activo'
                    };
                    await setDoc(doc(db, 'empleados', `admin_${cleanSlugId}`), adminDocData, { merge: true });
                    await setDoc(doc(db, 'firmas_duplicadas', empresaSlug, 'empleados', 'admin_principal'), adminDocData, { merge: true });
                } catch(docErr) {
                    console.warn("No se pudo escribir perfil en empleados:", docErr);
                }

                setActiveTenantId(empresaSlug);
                goto('/dashboard');
                return;
            }

            // Error final
            errorMsg = 'Usuario o contraseña incorrectos para esta firma.';
        } catch (error) {
            console.error("Error al autenticar:", error);
            errorMsg = 'Error al ingresar: ' + (error.message || 'Inténtalo de nuevo.');
        } finally {
            isLoading = false;
        }
    }

    async function instalarPWA() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                canInstall = false;
            }
            deferredPrompt = null;
        } else {
            alert(`Para instalar la App de ${firma?.nombre || 'la Firma'} en tu móvil:\n\n1. En iPhone (Safari): Presiona el botón "Compartir" y selecciona "Agregar al inicio".\n2. En Android (Chrome): Presiona el menú (tres puntos) y selecciona "Instalar aplicación" o "Agregar a pantalla principal".\n\nSe instalará con su logotipo y nombre oficial.`);
        }
    }

    function autofillAdminCreds() {
        if (firma?.administradorGeneral) {
            email = firma.administradorGeneral.email || '';
            password = firma.administradorGeneral.password || '';
        }
    }
</script>

<svelte:head>
    <title>{firma?.nombre ? `${firma.nombre} - Portal Oficial` : 'Portal Jurídico Corporativo'}</title>
    {#if firma?.logoUrl}
        <link rel="icon" type="image/png" href={firma.logoUrl} />
        <link rel="apple-touch-icon" href={firma.logoUrl} />
    {/if}
    <meta name="theme-color" content={firma?.colorPrimario || '#006a39'} />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content={firma?.nombre || 'Firma'} />
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style="background-color: {firma?.colorFondo || '#f8f9ff'}">
    
    <!-- Watermark de Fondo de la Marca -->
    <div class="absolute inset-0 flex items-center justify-center opacity-[0.035] pointer-events-none select-none overflow-hidden">
        <img
            src={firma?.logoUrl || logoDefault}
            alt="Watermark"
            style="width: 70vw; max-width: 800px; object-fit: contain; filter: grayscale(100%);"
        />
    </div>

    <!-- Orbes decorativos dinámicos según color de la firma -->
    <div
        class="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
        style="background-color: {firma?.colorPrimario || '#006a39'}"
    ></div>
    <div
        class="absolute -bottom-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
        style="background-color: {firma?.colorSecundario || '#c5a059'}"
    ></div>

    {#if cargandoFirma}
        <div
            class="bg-white/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-200 text-center space-y-4"
            style="width: 100%; max-width: 440px;"
        >
            <div class="w-12 h-12 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mx-auto"></div>
            <p class="text-sm font-bold text-slate-700">Cargando Portal de la Firma...</p>
        </div>
    {:else if firmaNoEncontrada}
        <div
            class="bg-white/95 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-200 text-center space-y-5"
            style="width: 100%; max-width: 480px;"
        >
            <div class="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                <span class="material-symbols-outlined text-[32px]">domain_disabled</span>
            </div>
            <div>
                <h2 class="text-xl font-bold text-slate-900">Portal No Encontrado</h2>
                <p class="text-xs text-slate-500 mt-1">
                    No se encontró ninguna firma jurídica registrada bajo la ruta <strong class="text-slate-800">/{empresaSlug}</strong>.
                </p>
            </div>
            <div class="pt-2">
                <a
                    href="/"
                    class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition-all shadow-md"
                >
                    <span class="material-symbols-outlined text-[16px]">home</span>
                    Volver a Casa Legal Master
                </a>
            </div>
        </div>
    {:else if firma}
        <!-- TARJETA PRINCIPAL DEL PORTAL CORPORATIVO (Sin clases max-w que causen encogimiento) -->
        <main
            in:fly={{ y: 20, duration: 600 }}
            class="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-black/10 p-6 sm:p-8 space-y-6 relative z-10"
            style="width: 100%; max-width: 480px; min-width: 320px;"
        >
            <!-- Badge de Portal Exclusivo -->
            <div class="flex items-center justify-between">
                <span
                    class="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono border"
                    style="background-color: {firma.colorPrimario}15; color: {firma.colorPrimario}; border-color: {firma.colorPrimario}30;"
                >
                    PORTAL OFICIAL
                </span>
                <button
                    type="button"
                    onclick={instalarPWA}
                    class="text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Instalar como App en celular o PC"
                >
                    <span class="material-symbols-outlined text-[16px] text-emerald-600">install_mobile</span>
                    Instalar App Móvil
                </button>
            </div>

            <!-- Logotipo y Nombre Corporativo -->
            <div class="text-center space-y-3">
                <div class="w-24 h-24 mx-auto bg-white rounded-2xl shadow-md border border-slate-100 flex items-center justify-center p-2 overflow-hidden">
                    {#if firma.logoUrl}
                        <img
                            src={firma.logoUrl}
                            alt={firma.nombre}
                            class="w-full h-full object-contain"
                        />
                    {:else}
                        <div class="w-full h-full rounded-xl flex items-center justify-center font-serif text-2xl font-bold" style="background-color: {firma.colorPrimario}15; color: {firma.colorPrimario}">
                            {(firma.nombre || 'FL').slice(0, 2).toUpperCase()}
                        </div>
                    {/if}
                </div>

                <div>
                    <h1 class="text-2xl font-bold font-serif tracking-tight" style="color: {firma.colorPrimario}">
                        {firma.nombre}
                    </h1>
                    <p class="text-xs font-semibold text-slate-600 uppercase tracking-wider mt-0.5">
                        {firma.subtitulo || 'Firma Jurídica'}
                    </p>
                    {#if firma.eslogan}
                        <p class="text-[11px] text-slate-400 italic mt-1 font-serif">
                            "{firma.eslogan}"
                        </p>
                    {/if}
                </div>
            </div>

            <!-- Alerta de Error -->
            {#if errorMsg}
                <div in:fade class="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center gap-2">
                    <span class="material-symbols-outlined text-[18px] text-red-600 shrink-0">error</span>
                    <span>{errorMsg}</span>
                </div>
            {/if}

            <!-- Formulario de Acceso -->
            <form onsubmit={handleLogin} class="space-y-4">
                <div>
                    <label for="emailInput" class="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Usuario / Correo Electrónico
                    </label>
                    <div class="relative">
                        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">account_circle</span>
                        <input
                            id="emailInput"
                            type="text"
                            bind:value={email}
                            required
                            placeholder="admin o correo oficial..."
                            class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-600 focus:bg-white transition-colors"
                        />
                    </div>
                </div>

                <div>
                    <div class="flex items-center justify-between mb-1">
                        <label for="passwordInput" class="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                            Contraseña
                        </label>
                        {#if firma.administradorGeneral?.password}
                            <button
                                type="button"
                                onclick={autofillAdminCreds}
                                class="text-[10px] font-bold hover:underline cursor-pointer"
                                style="color: {firma.colorPrimario}"
                            >
                                Autorrellenar Clave
                            </button>
                        {/if}
                    </div>
                    <div class="relative">
                        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">lock</span>
                        <input
                            id="passwordInput"
                            type="password"
                            bind:value={password}
                            required
                            placeholder="••••••••••••"
                            class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-600 focus:bg-white transition-colors"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    class="w-full py-3 rounded-xl font-bold text-xs text-white shadow-lg hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    style="background-color: {firma.colorPrimario}"
                >
                    {#if isLoading}
                        <span class="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                        <span>Ingresando al Sistema...</span>
                    {:else}
                        <span class="material-symbols-outlined text-[16px]">login</span>
                        <span>Ingresar a {firma.nombre}</span>
                    {/if}
                </button>
            </form>

            <!-- Credenciales Iniciales para Entrega al Cliente -->
            {#if firma.administradorGeneral?.email && mostrarCredenciales}
                <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px] text-emerald-600">vpn_key</span>
                            Credenciales Maestras de Entrega
                        </span>
                        <button
                            type="button"
                            onclick={autofillAdminCreds}
                            class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors cursor-pointer"
                        >
                            Usar Credenciales
                        </button>
                    </div>
                    <div class="grid grid-cols-2 gap-2 font-mono text-[11px]">
                        <div>
                            <span class="text-slate-400 text-[9px] block">Usuario:</span>
                            <span class="font-bold text-slate-800 select-all">{firma.administradorGeneral.email}</span>
                        </div>
                        <div>
                            <span class="text-slate-400 text-[9px] block">Clave:</span>
                            <span class="font-bold text-emerald-800 select-all">{firma.administradorGeneral.password}</span>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Footer Informativo -->
            <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Moneda: <strong class="text-slate-700">{firma.moneda || 'Bs.'}</strong></span>
                <span class="font-mono">ID: {firma.slug || empresaSlug}</span>
            </div>
        </main>
    {/if}

</div>
