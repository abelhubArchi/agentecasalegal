<script>
    import { onMount, onDestroy } from 'svelte';
    import { authStore } from '$lib/stores/auth.js';
    import { sidebarOpen } from '$lib/stores/ui.js';
    import { goto } from '$app/navigation';
    import { subscribeToAgenda } from '$lib/firebase/agenda.js';
    import { subscribeToHistorial } from '$lib/firebase/historial.js';
    import { auth, signOut } from '$lib/firebase/client.js';
    import { 
        subscribeToNotificaciones, 
        marcarNotificacionLeida, 
        solicitarPermisoPush, 
        abrirEnGmail 
    } from '$lib/services/notificaciones.js';

    // For the UI we can just take the first letter if no photo, or provide a default
    let userName = $derived($authStore.profile?.name || $authStore.user?.email || 'Usuario');
    let userRole = $derived($authStore.profile?.guide ? `Guía: ${$authStore.profile.guide}` : 'Abogado');
    let userPhoto = $derived($authStore.profile?.photoURL || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y');

    let showNotifications = $state(false);
    let showHistory = $state(false);
    
    let eventos = $state([]);
    let historial = $state([]);
    let notifsSistema = $state([]);
    let dismissedNotifs = $state([]);
    let unsubAgenda = null;
    let unsubHistorial = null;
    let unsubNotifs = null;
    let pushPermissionState = $state('default');

    onMount(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            pushPermissionState = Notification.permission;
        }
        const saved = localStorage.getItem('dismissedNotifs');
        if (saved) {
            try { dismissedNotifs = JSON.parse(saved); } catch(e) {}
        }
        unsubAgenda = subscribeToAgenda(data => eventos = data);
        unsubHistorial = subscribeToHistorial(50, data => historial = data);

        const uid = $authStore.user?.uid || 'admin';
        const email = $authStore.user?.email || '';
        unsubNotifs = subscribeToNotificaciones(uid, email, (data) => {
            notifsSistema = data;
        });
    });

    onDestroy(() => {
        if (unsubAgenda) unsubAgenda();
        if (unsubHistorial) unsubHistorial();
        if (unsubNotifs) unsubNotifs();
    });

    // Notificaciones combinadas: Eventos próximos de agenda + Notificaciones en tiempo real del sistema (Chat, Cuentas, Enlaces)
    let notificacionesEventos = $derived(eventos.filter(ev => {
        if (dismissedNotifs.includes(ev.id)) return false;
        const isForMe = ev.asignadoA === 'todos' || ev.asignadoA === $authStore.user?.uid;
        if (!isForMe) return false;
        const eventDate = ev.fechaHora?.toDate ? ev.fechaHora.toDate() : new Date(ev.fechaHora);
        const ayer = new Date();
        ayer.setDate(ayer.getDate() - 1);
        return eventDate > ayer;
    }).map(ev => ({
        id: ev.id,
        tipo: 'calendario',
        asunto: ev.titulo,
        mensaje: ev.notas || `Actividad (${ev.tipo})`,
        fecha: ev.fechaHora,
        linkAccion: '/dashboard/calendario',
        esEvento: true,
        leido: dismissedNotifs.includes(ev.id)
    })));

    let todasNotificaciones = $derived([
        ...notifsSistema.filter(n => !dismissedNotifs.includes(n.id)),
        ...notificacionesEventos
    ].slice(0, 15));

    let unreadCount = $derived(todasNotificaciones.filter(n => !n.leido).length);
    let hasUnread = $derived(unreadCount > 0);

    async function marcarLeidas() {
        const idsToDismiss = todasNotificaciones.map(n => n.id);
        dismissedNotifs = [...dismissedNotifs, ...idsToDismiss];
        localStorage.setItem('dismissedNotifs', JSON.stringify(dismissedNotifs));
        for (const n of notifsSistema) {
            if (!n.leido) {
                await marcarNotificacionLeida(n.id);
            }
        }
    }

    async function activarPush() {
        const res = await solicitarPermisoPush();
        pushPermissionState = res;
        if (res === 'granted') {
            alert("¡Notificaciones Push activadas con éxito! Recibirás alertas de mensajes, ingresos y agenda en este dispositivo.");
        }
    }

    function openSettings() {
        goto('/dashboard/settings');
    }
    
    // Format helpers
    function timeAgo(dateInput) {
        if (!dateInput) return '';
        const d = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
        const diffMs = new Date() - d;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Hace un momento';
        if (diffMins < 60) return `Hace ${diffMins} min`;
        const diffHrs = Math.floor(diffMins / 60);
        if (diffHrs < 24) return `Hace ${diffHrs} h`;
        return d.toLocaleDateString('es-MX', {day:'2-digit', month:'short'});
    }
    
    function formatDateStr(dateInput) {
        if (!dateInput) return '';
        const d = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
        return d.toLocaleDateString('es-MX', {weekday: 'short', day: '2-digit', month: 'short', hour:'2-digit', minute:'2-digit'});
    }

    let isLoggingOut = $state(false);
    async function handleLogout() {
        if (!confirm('¿Estás seguro que deseas cerrar sesión?')) return;
        isLoggingOut = true;
        try {
            const activeTenant = typeof window !== 'undefined' ? localStorage.getItem('current_tenant_slug') : null;
            await signOut(auth);
            if (activeTenant && activeTenant !== 'casa-legal' && activeTenant !== 'default') {
                goto(`/${activeTenant}`);
            } else {
                goto('/');
            }
        } catch (error) {
            console.error("Error signing out: ", error);
        } finally {
            isLoggingOut = false;
        }
    }
</script>

<header class="sticky top-0 left-0 md:left-[260px] right-0 h-[72px] bg-background/80 backdrop-blur-md border-b border-outline-variant flex items-center justify-between px-md md:px-lg z-30">
    <div class="flex items-center gap-sm">
        <button onclick={() => $sidebarOpen = true} class="md:hidden p-xs text-on-surface-variant hover:text-primary transition-all rounded-lg hover:bg-surface-container">
            <span class="material-symbols-outlined text-[28px]">menu</span>
        </button>
        <div class="hidden sm:flex items-center bg-surface-container-low px-md py-xs rounded-full border border-outline-variant w-[200px] md:w-[400px]">
            <span class="material-symbols-outlined text-on-surface-variant mr-sm">search</span>
            <input class="bg-transparent border-none focus:ring-0 text-body-md font-body-md w-full text-on-surface placeholder:text-on-surface-variant/50" placeholder="Buscar..." type="text">
            <span class="hidden md:inline text-label-sm font-label-sm text-tertiary-fixed-dim px-xs border border-tertiary-fixed-dim rounded">⌘K</span>
        </div>
    </div>
    
    <div class="flex items-center gap-lg">
        <a href="/presentacion" class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#c5a059]/60 bg-[#006a39]/10 hover:bg-[#006a39]/20 text-[#006a39] font-bold text-label-sm transition-all" title="Modo Jefe — Presentación a Pantalla Completa">
            <span class="material-symbols-outlined text-[18px] text-[#c5a059]">co_present</span>
            <span>Modo Jefe</span>
        </a>

        <div class="flex items-center gap-md relative">
            <!-- Notifications Bell -->
            <button onclick={() => {showNotifications = !showNotifications; showHistory = false;}} class="relative p-xs text-on-surface-variant hover:text-primary transition-all rounded-full hover:bg-surface-container {showNotifications ? 'bg-surface-container text-primary' : ''}">
                <span class="material-symbols-outlined">notifications</span>
                {#if hasUnread}
                    <span class="absolute top-1 right-1 w-2.5 h-2.5 bg-error rounded-full border-2 border-background animate-pulse"></span>
                    <span class="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 text-[9px] font-bold font-mono bg-error text-white rounded-full flex items-center justify-center border border-background">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                {/if}
            </button>
            
            <!-- Notifications Popover -->
            {#if showNotifications}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="fixed inset-0 z-40" onclick={() => showNotifications = false}></div>
                <div class="absolute top-12 right-0 sm:right-12 w-[340px] sm:w-[380px] bg-surface/95 backdrop-blur-xl border border-outline-variant rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[85vh] animation-scale origin-top-right">
                    <div class="p-3.5 border-b border-outline-variant bg-surface-container-lowest flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <h3 class="font-bold text-label-lg text-on-surface">Notificaciones</h3>
                            {#if unreadCount > 0}
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary">
                                    {unreadCount} nuevas
                                </span>
                            {/if}
                        </div>
                        {#if hasUnread}
                            <button onclick={marcarLeidas} class="text-[11px] font-bold text-primary hover:underline">Marcar leídas</button>
                        {/if}
                    </div>

                    <!-- Push Permission Request Banner -->
                    {#if pushPermissionState === 'default'}
                        <div class="p-2.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between gap-2">
                            <div class="flex items-center gap-1.5 min-w-0">
                                <span class="material-symbols-outlined text-primary text-[18px]">add_alert</span>
                                <span class="text-[11px] text-on-surface truncate">¿Activar alertas Push en este equipo?</span>
                            </div>
                            <button
                                onclick={activarPush}
                                class="px-2.5 py-1 rounded-lg bg-primary text-on-primary text-[10px] font-bold shrink-0 hover:opacity-90"
                            >
                                Activar
                            </button>
                        </div>
                    {/if}

                    <div class="overflow-y-auto custom-scrollbar flex-1 divide-y divide-outline-variant/40">
                        {#if todasNotificaciones.length === 0}
                            <div class="p-8 text-center text-on-surface-variant opacity-70">
                                <span class="material-symbols-outlined text-[32px] mb-2 block">notifications_paused</span>
                                <p class="text-label-sm">No tienes notificaciones pendientes</p>
                            </div>
                        {/if}
                        {#each todasNotificaciones as noti}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div 
                                onclick={() => {
                                    if (noti.linkAccion) {
                                        showNotifications = false;
                                        goto(noti.linkAccion);
                                    }
                                }}
                                class="p-3 hover:bg-primary/5 transition-colors cursor-pointer flex gap-3 items-start {noti.leido ? 'opacity-70' : 'bg-primary/[0.03]'}"
                            >
                                <!-- Icono según tipo -->
                                <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5
                                    {noti.tipo === 'chat' ? 'bg-emerald-100 text-emerald-800' : 
                                     noti.tipo === 'ingreso' ? 'bg-amber-100 text-amber-800' : 
                                     noti.tipo === 'secreto' ? 'bg-blue-100 text-blue-800' : 
                                     'bg-primary-container text-on-primary-container'}"
                                >
                                    <span class="material-symbols-outlined text-[16px]">
                                        {noti.tipo === 'chat' ? 'chat' : 
                                         noti.tipo === 'ingreso' ? 'payments' : 
                                         noti.tipo === 'secreto' ? 'shield' : 
                                         'calendar_month'}
                                    </span>
                                </div>

                                <div class="flex-1 min-w-0">
                                    <p class="font-bold text-xs text-on-surface leading-tight mb-0.5 truncate">{noti.asunto}</p>
                                    <p class="text-[11px] text-on-surface-variant line-clamp-2 leading-snug">{noti.mensaje}</p>
                                    <div class="flex items-center justify-between gap-2 mt-1.5 text-[10px] text-on-surface-variant/70 font-mono">
                                        <span>{noti.fecha ? timeAgo(noti.fecha) : 'Reciente'}</span>
                                        {#if noti.linkAccion}
                                            <span class="text-primary font-bold hover:underline flex items-center gap-0.5">
                                                Ver <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
                                            </span>
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>

                    <div class="p-2.5 bg-surface-container-lowest border-t border-outline-variant flex justify-between items-center text-xs">
                        <button onclick={() => { showNotifications = false; goto('/dashboard/chatlegal'); }} class="text-[11px] font-bold text-primary hover:underline">
                            Chat Legal
                        </button>
                        <button onclick={() => { showNotifications = false; goto('/dashboard/cuentas'); }} class="text-[11px] font-bold text-primary hover:underline">
                            Bóveda Cuentas
                        </button>
                        <button onclick={() => { showNotifications = false; goto('/dashboard/calendario'); }} class="text-[11px] font-bold text-primary hover:underline">
                            Calendario
                        </button>
                    </div>
                </div>
            {/if}

            <!-- History Button -->
            <button onclick={() => {showHistory = !showHistory; showNotifications = false;}} class="p-xs text-on-surface-variant hover:text-primary transition-all rounded-full hover:bg-surface-container {showHistory ? 'bg-surface-container text-primary' : ''}">
                <span class="material-symbols-outlined">history</span>
            </button>
            
            <!-- History Popover (Bitácora) -->
            {#if showHistory}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="fixed inset-0 z-40" onclick={() => showHistory = false}></div>
                <div class="absolute top-12 right-0 w-[380px] bg-surface/90 backdrop-blur-xl border border-outline-variant rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[85vh] animation-scale origin-top-right">
                    <div class="p-md border-b border-outline-variant bg-surface-container-lowest flex justify-between items-center">
                        <h3 class="font-bold text-label-lg text-on-surface flex items-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">list_alt</span>
                            Auditoría (En vivo)
                        </h3>
                    </div>
                    <div class="overflow-y-auto custom-scrollbar flex-1">
                        {#if historial.length === 0}
                            <div class="p-xl text-center text-on-surface-variant opacity-70">
                                <span class="material-symbols-outlined text-[32px] mb-2 block">history_toggle_off</span>
                                <p class="text-label-sm">No hay actividad reciente</p>
                            </div>
                        {/if}
                        <div class="p-md space-y-4">
                            {#each historial as reg}
                                <div class="flex gap-md relative">
                                    <div class="w-10 h-10 rounded-full border-2 border-surface shrink-0 flex items-center justify-center font-bold text-[14px] bg-secondary-container text-on-secondary-container z-10">
                                        {(reg.autorNombre || 'S').charAt(0).toUpperCase()}
                                    </div>
                                    <div class="absolute top-10 left-5 w-[2px] h-[calc(100%+16px)] bg-outline-variant/30 -z-0 last:hidden"></div>
                                    <div class="pt-1 w-full">
                                        <div class="flex justify-between items-center mb-1">
                                            <span class="text-[10px] uppercase font-bold bg-surface-container-high px-2 py-0.5 rounded text-on-surface-variant tracking-wider">{reg.modulo}</span>
                                            <span class="text-[10px] text-outline">{timeAgo(reg.fechaCreacion)}</span>
                                        </div>
                                        <p class="text-label-md font-bold text-on-surface leading-tight mb-1">{reg.tipo}</p>
                                        <p class="text-body-sm text-on-surface-variant leading-snug bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30">{reg.descripcion}</p>
                                        <p class="text-[10px] mt-1 text-on-surface-variant italic">Por {reg.autorNombre}</p>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}
        </div>
        
        <div class="h-8 w-[1px] bg-outline-variant mx-sm"></div>
        
        <div class="flex items-center gap-md">
            <button onclick={openSettings} class="flex items-center gap-md cursor-pointer hover:bg-primary-container/10 p-xs pr-md rounded-full transition-all text-left">
                <img alt="Perfil" class="w-10 h-10 rounded-full border-2 border-primary/20 object-cover" src={userPhoto}>
                <div class="hidden lg:block">
                    <p class="font-label-md text-label-md text-on-surface font-bold leading-tight">{userName}</p>
                    <p class="font-label-sm text-label-sm text-on-surface-variant leading-tight">{userRole}</p>
                </div>
            </button>
            <button onclick={handleLogout} disabled={isLoggingOut} class="p-xs text-error hover:bg-error-container hover:text-on-error-container rounded-full transition-all flex items-center justify-center" title="Cerrar sesión">
                <span class="material-symbols-outlined">{isLoggingOut ? 'hourglass_empty' : 'logout'}</span>
            </button>
        </div>
    </div>
</header>

<style>
    .animation-scale {
        animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes scaleIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
</style>
