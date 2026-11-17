<script>
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import { empresaStore } from '$lib/stores/empresa.js';
    import logoFallback from '$lib/assets/logo.webp';
    import { obtenerSecretoPorId, registrarAccesoYRescateForense, purgarSecretoDefinitivo } from '$lib/firebase/chatlegal.js';
    import { notificarEnlaceSeguroAbierto } from '$lib/services/notificaciones.js';

    let secretoId = $derived($page.params.id);
    let secreto = $state(null);
    let loading = $state(true);
    let errorMsg = $state('');

    // Estado del PIN
    let pinIngresado = $state('');
    let pinError = $state(false);
    let revelado = $state(false);

    // Comprobar estrictamente si tiene PIN configurado
    let tienePin = $derived(!!(secreto?.tienePin && secreto?.clavePin && String(secreto.clavePin).trim().length > 0));

    // Temporizador de Autodestrucción
    let tiempoRestante = $state(10);
    let tiempoTotal = $state(10);
    let timerInterval = null;
    let mensajeDestruido = $state(false);

    // Anti-Espía y Anti-Captura
    let pantallaBloqueada = $state(false);

    // Captura Forense del Dispositivo (Rescate Silencioso)
    async function recolectarTelemetriaForense() {
        const telemetria = {
            fechaAcceso: new Date().toISOString(),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Desconocido',
            plataforma: typeof navigator !== 'undefined' ? (navigator.userAgentData?.platform || navigator.platform || 'Desconocido') : 'Desconocido',
            idioma: typeof navigator !== 'undefined' ? (navigator.language || navigator.languages?.[0]) : 'es',
            zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/La_Paz',
            resolucionPantalla: typeof screen !== 'undefined' ? `${screen.width}x${screen.height} (@${window.devicePixelRatio || 1}x)` : 'Desconocida',
            orientacion: typeof screen !== 'undefined' && screen.orientation ? screen.orientation.type : 'landscape',
            nucleosCpu: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 'N/A') : 'N/A',
            memoriaRamGiga: typeof navigator !== 'undefined' ? (navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A') : 'N/A',
            tipoConexion: typeof navigator !== 'undefined' && navigator.connection ? (navigator.connection.effectiveType || navigator.connection.type || 'Banda Ancha') : 'Estándar',
            velocidadDownlink: typeof navigator !== 'undefined' && navigator.connection && navigator.connection.downlink ? `${navigator.connection.downlink} Mbps` : 'N/A',
            nivelBateria: 'No disponible',
            cargandoBateria: false,
            ipPublica: 'Consultando...',
            dispositivoEstimado: 'Dispositivo Móvil / PC'
        };

        const ua = telemetria.userAgent.toLowerCase();
        if (ua.includes('iphone')) telemetria.dispositivoEstimado = 'Apple iPhone';
        else if (ua.includes('ipad')) telemetria.dispositivoEstimado = 'Apple iPad';
        else if (ua.includes('android')) telemetria.dispositivoEstimado = 'Dispositivo Android';
        else if (ua.includes('windows nt 10.0')) telemetria.dispositivoEstimado = 'Windows 10/11 PC';
        else if (ua.includes('macintosh')) telemetria.dispositivoEstimado = 'Apple Mac OS';
        else if (ua.includes('linux')) telemetria.dispositivoEstimado = 'Linux Workstation';

        // Batería (Chromium)
        try {
            if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
                const b = await navigator.getBattery();
                telemetria.nivelBateria = `${Math.round(b.level * 100)}%`;
                telemetria.cargandoBateria = b.charging;
            }
        } catch (e) {}

        // IP pública silenciosa
        try {
            const resp = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
            if (resp.ok) {
                const data = await resp.json();
                telemetria.ipPublica = data.ip;
            }
        } catch (e) {
            telemetria.ipPublica = 'IP Local / Red Privada';
        }

        return telemetria;
    }

    onMount(async () => {
        window.addEventListener('blur', handleBlur);
        window.addEventListener('focus', handleFocus);
        document.addEventListener('contextmenu', e => e.preventDefault());

        try {
            const docData = await obtenerSecretoPorId(secretoId);
            if (!docData) {
                errorMsg = 'El enlace confidencial no existe, ya expiró o fue purgado.';
                loading = false;
                return;
            }

            if (docData.destruido === true) {
                mensajeDestruido = true;
                loading = false;
                return;
            }

            secreto = docData;
            tiempoTotal = docData.tiempoSegundos || 10;
            tiempoRestante = tiempoTotal;
        } catch (e) {
            console.error(e);
            errorMsg = 'Error al descifrar el mensaje confidencial.';
        } finally {
            loading = false;
        }
    });

    onDestroy(() => {
        if (timerInterval) clearInterval(timerInterval);
        if (typeof window !== 'undefined') {
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('focus', handleFocus);
        }
    });

    function handleBlur() {
        if (revelado && !mensajeDestruido) {
            pantallaBloqueada = true;
        }
    }

    function handleFocus() {
        pantallaBloqueada = false;
    }

    async function handleVerificarPin(e) {
        e.preventDefault();
        if (pinIngresado.trim() === (secreto.clavePin || '').trim()) {
            pinError = false;
            await ejecutarRevelacion();
        } else {
            pinError = true;
        }
    }

    async function ejecutarRevelacion() {
        revelado = true;
        // 1. Rescatar telemetría del dispositivo
        const telemetria = await recolectarTelemetriaForense();
        // 2. Registrar en base de datos para auditoría de la firma
        await registrarAccesoYRescateForense(secretoId, telemetria);

        // Notificar al emisor por Push y Email / Gmail
        if (secreto?.emisorEmail) {
            notificarEnlaceSeguroAbierto({
                emisorEmail: secreto.emisorEmail,
                emisorNombre: secreto.emisorNombre || 'Abogado',
                enlaceId: secretoId,
                telemetria
            }).catch(e => console.warn("Aviso apertura enlace:", e));
        }

        // 3. Iniciar temporizador regresivo
        timerInterval = setInterval(() => {
            tiempoRestante--;
            if (tiempoRestante <= 0) {
                clearInterval(timerInterval);
                autodestruir();
            }
        }, 1000);
    }

    async function autodestruir() {
        mensajeDestruido = true;
        revelado = false;
        try {
            await purgarSecretoDefinitivo(secretoId);
        } catch (e) {}
    }
</script>

<svelte:head>
    <title>Comunicación Confidencial — {$empresaStore?.nombre || 'Firma Jurídica'}</title>
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen w-full bg-[#f8f9fa] text-[#1a1d1e] font-sans flex flex-col justify-between p-4 sm:p-6 md:p-10 select-none relative" oncontextmenu={(e) => e.preventDefault()}>
    
    <!-- Top Decorative Line -->
    <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#006a39] via-[#c5a059] to-[#006a39]"></div>

    <!-- Header Corporativo Elegante -->
    <header class="w-full mx-auto flex flex-col sm:flex-row justify-between items-center pb-4 border-b border-slate-200 gap-3 shrink-0" style="width: 100%; max-width: 680px;">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center shadow-xs overflow-hidden shrink-0">
                <img src={$empresaStore?.logoUrl || logoFallback} alt="Logo" class="w-full h-full object-contain" />
            </div>
            <div>
                <h1 class="text-sm font-bold tracking-tight text-[#0c1a14] uppercase">
                    {$empresaStore?.nombre || 'CASA LEGAL'}
                </h1>
                <p class="text-[11px] text-slate-500">
                    {$empresaStore?.subtitulo || 'Protocolo de Comunicación Confidencial'}
                </p>
            </div>
        </div>

        <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#c5a059]/15 text-[#8c6d23] border border-[#c5a059]/30 flex items-center gap-1 font-mono">
                <span class="w-1.5 h-1.5 rounded-full bg-[#c5a059]"></span>
                Secreto Profesional
            </span>
        </div>
    </header>

    <!-- Contenido Principal -->
    <main class="w-full mx-auto my-auto py-6" style="width: 100%; max-width: 680px;">
        
        {#if loading}
            <div class="bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4 shadow-sm">
                <span class="material-symbols-outlined text-4xl text-[#006a39] animate-spin">progress_activity</span>
                <p class="text-xs uppercase tracking-widest text-slate-600 font-bold">
                    Verificando integridad y descifrando documento...
                </p>
            </div>

        {:else if errorMsg}
            <div class="bg-white border border-red-200 p-8 rounded-3xl text-center space-y-3 shadow-md">
                <div class="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
                    <span class="material-symbols-outlined text-3xl">lock_clock</span>
                </div>
                <h2 class="text-base font-bold text-slate-900">Enlace No Válido o Expirado</h2>
                <p class="text-xs text-slate-600 leading-relaxed mx-auto" style="max-width: 480px;">{errorMsg}</p>
                <div class="text-[10px] text-slate-400 font-mono pt-2">
                    CÓDIGO: CONF_EXP • PROTECCIÓN DE CONFIDENCIALIDAD
                </div>
            </div>

        {:else if mensajeDestruido}
            <div class="bg-white border border-[#c5a059]/40 p-8 rounded-3xl text-center space-y-4 shadow-lg relative overflow-hidden">
                <div class="w-16 h-16 rounded-full bg-[#006a39]/10 text-[#006a39] flex items-center justify-center mx-auto shadow-xs border border-[#006a39]/20">
                    <span class="material-symbols-outlined text-3xl">verified_user</span>
                </div>
                
                <div>
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 font-mono">
                        Cero Rastro Digital
                    </span>
                    <h2 class="text-lg font-bold text-[#0c1a14] mt-2">
                        Documento Purgado del Servidor
                    </h2>
                </div>

                <p class="text-xs text-slate-600 mx-auto leading-relaxed" style="max-width: 480px;">
                    Conforme al protocolo de <strong>Secreto Profesional y Privacidad Jurídica</strong>, este mensaje confidencial ha sido <strong>autodestruido de forma irreversible</strong>. No quedan respaldos ni copias en el servidor.
                </p>

                <div class="pt-4 border-t border-slate-100 font-mono text-[10px] text-slate-400">
                    ESTADO: PURGADO DEFINITIVAMENTE • PROTOCOLO CHAT LEGAL
                </div>
            </div>

        {:else if !revelado && tienePin}
            <!-- Solicitar PIN de Desbloqueo (SOLO si realmente tiene PIN configurado) -->
            <div class="bg-white border border-slate-200 p-6 sm:p-8 rounded-3xl shadow-lg space-y-5">
                <div class="text-center space-y-1.5">
                    <div class="w-12 h-12 rounded-2xl bg-[#006a39]/10 text-[#006a39] flex items-center justify-center mx-auto mb-2">
                        <span class="material-symbols-outlined text-2xl">key</span>
                    </div>
                    <h2 class="text-base font-bold text-slate-900 uppercase tracking-tight">Acceso Protegido por PIN</h2>
                    <p class="text-xs text-slate-500 mx-auto" style="max-width: 380px;">
                        Este comunicado legal requiere la clave de seguridad provista por el abogado remitente.
                    </p>
                </div>

                <form onsubmit={handleVerificarPin} class="space-y-4 mx-auto" style="max-width: 320px; width: 100%;">
                    <div>
                        <input
                            type="password"
                            bind:value={pinIngresado}
                            placeholder="PIN de acceso"
                            maxlength="8"
                            class="w-full bg-slate-50 border border-slate-300 rounded-2xl py-3 px-4 text-center font-mono text-xl tracking-[0.4em] text-slate-800 focus:border-[#006a39] focus:bg-white focus:ring-2 focus:ring-[#006a39]/20 outline-none transition-all font-bold"
                            required
                        />
                        {#if pinError}
                            <span class="text-[11px] text-red-600 mt-2 block text-center font-bold">
                                PIN incorrecto. Intenta nuevamente.
                            </span>
                        {/if}
                    </div>

                    <button
                        type="submit"
                        class="w-full py-3 rounded-2xl bg-[#006a39] text-white font-bold text-xs uppercase tracking-wider hover:bg-[#00542d] transition-all shadow-md shadow-[#006a39]/20"
                    >
                        Desbloquear y Ver ({secreto.tiempoSegundos}s)
                    </button>
                </form>
            </div>

        {:else if !revelado && !tienePin}
            <!-- SIN PIN: Pantalla de Revelación Segura (cuando el lector esté listo) -->
            <div class="bg-white border border-slate-200 p-6 sm:p-8 rounded-3xl shadow-lg space-y-5 text-center">
                <div class="w-16 h-16 rounded-full bg-[#006a39]/10 text-[#006a39] flex items-center justify-center mx-auto shadow-xs border border-[#006a39]/20">
                    <span class="material-symbols-outlined text-3xl">mark_email_read</span>
                </div>

                <div>
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                        Comunicación Confidencial Lista
                    </span>
                    <h2 class="text-base sm:text-lg font-bold text-slate-900 mt-2">
                        {secreto?.titulo || 'Mensaje Judicial Reservado'}
                    </h2>
                    <p class="text-xs text-slate-500 mt-1">
                        Remitente: <strong class="text-slate-800">{secreto?.emisorNombre || 'Abogado de la Firma'}</strong>
                    </p>
                </div>

                <div class="p-3.5 bg-amber-50/80 rounded-2xl border border-amber-200/80 text-left space-y-1.5 text-xs">
                    <div class="flex items-center gap-1.5 font-bold text-amber-900">
                        <span class="material-symbols-outlined text-[18px] text-amber-700">timer</span>
                        <span>Lectura Efímera: {secreto?.tiempoSegundos || 10} Segundos</span>
                    </div>
                    <p class="text-[11px] text-slate-600 leading-relaxed">
                        Al presionar el botón se descifrará el contenido en pantalla y se activará la cuenta regresiva de autodestrucción.
                    </p>
                </div>

                <button
                    type="button"
                    onclick={ejecutarRevelacion}
                    class="w-full py-3.5 rounded-2xl bg-[#006a39] text-[#ffe08e] font-bold text-xs uppercase tracking-wider hover:bg-[#00542d] transition-all shadow-md shadow-[#006a39]/20 flex items-center justify-center gap-2"
                >
                    <span class="material-symbols-outlined text-[18px]">lock_open</span>
                    <span>Revelar y Leer Mensaje ({secreto?.tiempoSegundos || 10}s)</span>
                </button>
            </div>

        {:else if revelado}
            <!-- Vista del Mensaje Confidencial con Cronómetro -->
            <div class="space-y-4">
                
                <!-- Barra de Alerta y Cronómetro Regresivo -->
                <div class="bg-white border border-[#c5a059] p-4 rounded-2xl flex items-center justify-between shadow-sm">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-xl {tiempoRestante <= 3 ? 'animate-bounce text-red-600' : ''}">timer</span>
                        </div>
                        <div>
                            <span class="text-xs font-bold text-slate-900 block">Autodestrucción en progreso</span>
                            <span class="text-[11px] text-slate-500">Este mensaje se borrará al finalizar el tiempo</span>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2">
                        <div class="text-xl sm:text-2xl font-mono font-bold px-3 py-1 rounded-xl border transition-all {tiempoRestante <= 3 ? 'bg-red-50 text-red-700 border-red-300 animate-pulse' : 'bg-slate-50 text-[#006a39] border-slate-200'}">
                            00:{String(tiempoRestante).padStart(2, '0')}s
                        </div>
                    </div>
                </div>

                <!-- Barra de Progreso Lineal -->
                <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div 
                        class="h-full bg-gradient-to-r from-[#006a39] to-[#c5a059] transition-all duration-1000 ease-linear rounded-full"
                        style="width: {(tiempoRestante / tiempoTotal) * 100}%;"
                    ></div>
                </div>

                <!-- Tarjeta del Mensaje Legal -->
                <div class="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-lg relative">
                    <div class="flex justify-between items-center pb-3 mb-4 border-b border-slate-100 text-[11px] text-slate-500">
                        <span class="font-bold text-[#006a39] flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[15px]">shield</span>
                            Remitente: {secreto.emisorNombre || 'Abogado de la Firma'}
                        </span>
                        <span class="font-mono text-slate-400">ID: {secretoId.slice(0, 8)}...</span>
                    </div>

                    {#if pantallaBloqueada}
                        <div class="p-8 text-center space-y-2 bg-slate-50 rounded-2xl border border-amber-300">
                            <span class="material-symbols-outlined text-3xl text-amber-600">visibility_off</span>
                            <p class="text-xs text-amber-800 font-bold uppercase">
                                Pantalla Pausada (Foco Perdido)
                            </p>
                            <p class="text-[11px] text-slate-600">
                                Haz clic aquí para continuar la lectura antes de que se agote el tiempo.
                            </p>
                        </div>
                    {:else}
                        <div class="text-sm sm:text-base text-slate-800 leading-relaxed whitespace-pre-wrap select-none font-serif">
                            {secreto.texto}
                        </div>

                        {#if secreto.archivoUrl}
                            <div class="mt-4 pt-4 border-t border-slate-100">
                                {#if secreto.archivoTipo?.startsWith('image/')}
                                    <!-- Imagen Confidencial -->
                                    <div class="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-2 text-center">
                                        <img 
                                            src={secreto.archivoUrl} 
                                            alt={secreto.archivoNombre || 'Imagen Confidencial'} 
                                            class="max-h-[380px] w-auto mx-auto rounded-xl shadow-xs object-contain select-none"
                                            oncontextmenu={(e) => e.preventDefault()}
                                        />
                                        <span class="text-[10px] text-slate-400 mt-2 block font-mono">
                                            📷 {secreto.archivoNombre || 'imagen_confidencial'}
                                        </span>
                                    </div>
                                {:else if secreto.archivoTipo?.startsWith('audio/')}
                                    <!-- Audio / Nota de Voz Confidencial -->
                                    <div class="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 space-y-2">
                                        <div class="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase">
                                            <span class="material-symbols-outlined text-[20px] text-amber-700">mic</span>
                                            <span>Nota de Voz Confidencial ({secreto.archivoNombre || 'audio.webm'})</span>
                                        </div>
                                        <audio controls autoplay src={secreto.archivoUrl} class="w-full mt-2 outline-none">
                                            Tu navegador no soporta el reproductor de audio.
                                        </audio>
                                        <p class="text-[10px] text-amber-700">
                                            ⚠️ Este audio se autodestruirá cuando expire el temporizador.
                                        </p>
                                    </div>
                                {:else}
                                    <!-- Archivo / Documento (PDF, Word, etc.) -->
                                    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-xl bg-[#006a39]/10 text-[#006a39] flex items-center justify-center shrink-0 border border-[#006a39]/20">
                                                <span class="material-symbols-outlined text-xl">description</span>
                                            </div>
                                            <div>
                                                <div class="text-xs font-bold text-slate-800 break-all">{secreto.archivoNombre || 'documento_adjunto'}</div>
                                                <div class="text-[10px] text-slate-400 font-mono">
                                                    {secreto.archivoSize ? `${(secreto.archivoSize / 1024).toFixed(1)} KB` : 'Archivo protegido'}
                                                </div>
                                            </div>
                                        </div>
                                        <a 
                                            href={secreto.archivoUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            download={secreto.archivoNombre || 'archivo_seguro'}
                                            class="px-4 py-2 rounded-xl bg-[#006a39] text-[#ffe08e] font-bold text-xs hover:bg-[#00542d] transition-all flex items-center gap-1.5 shadow-xs whitespace-nowrap shrink-0"
                                        >
                                            <span class="material-symbols-outlined text-[16px]">download</span>
                                            <span>Descargar Archivo</span>
                                        </a>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    {/if}

                    <div class="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] text-slate-400">
                        <span>PROTECCIÓN ANTI-COPIA • VISTA ÚNICA CONFIDENCIAL</span>
                        <button
                            type="button"
                            onclick={autodestruir}
                            class="px-3 py-1.5 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors uppercase font-bold text-[10px]"
                        >
                            Destruir Ahora
                        </button>
                    </div>
                </div>

            </div>
        {/if}

    </main>

    <!-- Footer Discreto -->
    <footer class="w-full mx-auto pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-slate-400" style="width: 100%; max-width: 680px;">
        <div>
            {$empresaStore?.nombre || 'CASA LEGAL'} • Comunicación Privilegiada y Reservada
        </div>
        <div class="font-mono text-[10px]">
            SEGURIDAD CRIPTOGRÁFICA PUNTO A PUNTO
        </div>
    </footer>

</div>

<style>
    :global(body) {
        background-color: #f8f9fa;
    }
</style>
