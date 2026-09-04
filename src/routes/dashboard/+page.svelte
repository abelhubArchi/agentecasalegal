<script>
    import { authStore } from '$lib/stores/auth.js';
    import { goto } from '$app/navigation';
    import { onMount, onDestroy } from 'svelte';
    import { subscribeToClientes } from '$lib/firebase/clientes.js';
    import { subscribeToAgenda, updateEvento } from '$lib/firebase/agenda.js';
    import { subscribeToEmpleados } from '$lib/firebase/empleados.js';
    import { subscribeToTransacciones } from '$lib/firebase/finanzas.js';
    import { generarInformeGeneral } from '$lib/pdf/generador.js';

    let userEmail = $state('');
    let clientes = $state([]);
    let eventos = $state([]);
    let empleados = $state([]);
    let transacciones = $state([]);
    let unsubscribeClientes = null;
    let unsubscribeAgenda = null;
    let unsubscribeEmpleados = null;
    let unsubscribeTransacciones = null;
    let loading = $state(true);
    let notifiedEvents = new Set();

    let currentEmpleado = $derived(empleados.find(e => e.authUid === $authStore.user?.uid));
    let isAdministrador = $derived(!currentEmpleado || currentEmpleado.rol === 'Administrador');
    
    // Filtro de Fechas
    let showDateRangeMenu = $state(false);
    let selectedRangeOption = $state('mes');
    let customStart = $state('');
    let customEnd = $state('');
    let isExporting = $state(false);

    const dateRanges = {
        'hoy': 'Hoy',
        'semana': 'Esta Semana',
        'mes': 'Últimos 30 días',
        'personalizado': 'Personalizado'
    };

    function getDateRange() {
        let start = null;
        let end = new Date();
        
        if (selectedRangeOption === 'hoy') {
            start = new Date();
            start.setHours(0,0,0,0);
        } else if (selectedRangeOption === 'semana') {
            start = new Date();
            start.setDate(start.getDate() - 7);
            start.setHours(0,0,0,0);
        } else if (selectedRangeOption === 'mes') {
            start = new Date();
            start.setDate(start.getDate() - 30);
            start.setHours(0,0,0,0);
        } else if (selectedRangeOption === 'personalizado') {
            if (customStart) {
                start = new Date(customStart);
                start.setDate(start.getDate() + 1); // Adjust timezone offset if necessary, but native input date is local midnight
                start.setHours(0,0,0,0);
            }
            if (customEnd) {
                end = new Date(customEnd);
                end.setDate(end.getDate() + 1);
                end.setHours(23,59,59,999);
            }
        }
        return { start, end };
    }

    async function handleExport() {
        isExporting = true;
        try {
            const { start, end } = getDateRange();
            await generarInformeGeneral({ start, end });
        } catch (e) {
            alert("Error al exportar");
        } finally {
            isExporting = false;
        }
    }
    
    // Finanzas Stats
    let ingresosMes = $derived(transacciones.filter(t => t.tipo === 'Ingreso' && new Date(t.fechaHora?.toDate ? t.fechaHora.toDate() : t.fechaHora).getMonth() === new Date().getMonth()).reduce((acc, t) => acc + t.monto, 0));
    let egresosMes = $derived(transacciones.filter(t => t.tipo === 'Egreso' && new Date(t.fechaHora?.toDate ? t.fechaHora.toDate() : t.fechaHora).getMonth() === new Date().getMonth()).reduce((acc, t) => acc + t.monto, 0));
    let utilidadMes = $derived(ingresosMes - egresosMes);

    let eventosPermitidos = $derived(eventos.filter(ev => {
        if (isAdministrador) return true;
        return currentEmpleado && (ev.asignadoA === currentEmpleado.id || ev.asignadoA === 'todos');
    }));
    
    // Derived statistics
    let totalClientesActivos = $derived(clientes.filter(c => c.estado !== 'Inactivo').length);
    let totalVisitasRecepcion = $derived(clientes.filter(c => c.estado !== 'Inactivo' && c.origen === 'recepcion').length);
    let nuevosEstaSemana = $derived.by(() => {
        const unaSemanaAtras = new Date();
        unaSemanaAtras.setDate(unaSemanaAtras.getDate() - 7);
        return clientes.filter(c => {
            if (!c.fechaRegistro) return false;
            const date = c.fechaRegistro.toDate ? c.fechaRegistro.toDate() : new Date(c.fechaRegistro);
            return date >= unaSemanaAtras && c.estado !== 'Inactivo';
        }).length;
    });

    let eventosHoy = $derived.by(() => {
        const today = new Date();
        return eventosPermitidos.filter(ev => {
            if (!ev.fechaHora) return false;
            // Handle both Firestore Timestamp and raw Date objects
            const evDate = (ev.fechaHora && typeof ev.fechaHora.toDate === 'function') ? ev.fechaHora.toDate() : new Date(ev.fechaHora);
            
            // Check if the event happens on the exact same calendar day
            return evDate.getDate() === today.getDate() && 
                   evDate.getMonth() === today.getMonth() && 
                   evDate.getFullYear() === today.getFullYear();
        });
    });

    function isExpiring(timestamp) {
        if(!timestamp) return false;
        const evDate = (timestamp && typeof timestamp.toDate === 'function') ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diff = evDate.getTime() - now.getTime();
        // Expiring in less than 4 hours (and not more than 2 hours in the past just to keep it red if slightly delayed)
        return diff > -(2 * 60 * 60 * 1000) && diff < (4 * 60 * 60 * 1000);
    }

    function isEventoRelevante(ev) {
        if (!isAdministrador) return true; // Para el empleado, todo lo que ve es relevante
        return ev.asignadoA === $authStore.user?.uid || ev.asignadoA === 'todos';
    }

    $effect(() => {
        // Trigger Push Notifications for expiring events
        if (typeof window !== 'undefined' && "Notification" in window && Notification.permission === "granted") {
            eventosHoy.forEach(ev => {
                if (ev.estado !== 'Completado' && isExpiring(ev.fechaHora)) {
                    if (!notifiedEvents.has(ev.id)) {
                        notifiedEvents.add(ev.id);
                        
                        const evDate = (ev.fechaHora && typeof ev.fechaHora.toDate === 'function') ? ev.fechaHora.toDate() : new Date(ev.fechaHora);
                        const timeString = evDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                        
                        new Notification("¡Actividad Próxima!", {
                            body: `Tienes: ${ev.titulo} a las ${timeString}`,
                            icon: 'https://cdn-icons-png.flaticon.com/512/3277/3277490.png' // Generic calendar icon
                        });
                    }
                }
            });
        }
    });

    onMount(() => {
        if ($authStore.user) {
            userEmail = $authStore.user.email;
        }

        // Request notification permissions silently if not asked yet
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }

        unsubscribeClientes = subscribeToClientes((data) => {
            clientes = data;
            loading = false;
        });

        unsubscribeAgenda = subscribeToAgenda((data) => {
            eventos = data;
        });
        
        unsubscribeEmpleados = subscribeToEmpleados((data) => {
            empleados = data;
        });

        unsubscribeTransacciones = subscribeToTransacciones((data) => {
            transacciones = data;
        });
    });

    onDestroy(() => {
        if (unsubscribeClientes) unsubscribeClientes();
        if (unsubscribeAgenda) unsubscribeAgenda();
        if (unsubscribeEmpleados) unsubscribeEmpleados();
        if (unsubscribeTransacciones) unsubscribeTransacciones();
    });
</script>

<div class="p-lg max-w-[1440px] mx-auto w-full">
    <!-- Welcome Header -->
    <div class="mb-xl flex justify-between items-end">
        <div>
            <h2 class="text-headline-xl font-headline-xl text-on-surface mb-xs">Resumen General</h2>
            <p class="text-body-lg text-on-surface-variant">Visualiza el estado actual de tu firma legal hoy. Datos en tiempo real.</p>
        </div>
        <div class="flex gap-sm relative">
            <button onclick={() => showDateRangeMenu = !showDateRangeMenu} class="flex items-center gap-xs bg-surface-container-lowest border border-outline-variant px-md py-sm rounded-lg text-label-md hover:bg-surface transition-colors">
                <span class="material-symbols-outlined text-[18px]">calendar_today</span>
                {dateRanges[selectedRangeOption]}
            </button>
            
            {#if showDateRangeMenu}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="fixed inset-0 z-40" onclick={() => showDateRangeMenu = false}></div>
                <div class="absolute top-[45px] right-[100px] bg-surface border border-outline-variant rounded-xl shadow-xl z-50 p-sm min-w-[200px] flex flex-col gap-1">
                    <button onclick={() => {selectedRangeOption = 'hoy'; showDateRangeMenu = false;}} class="text-left px-3 py-2 rounded-lg text-body-sm hover:bg-surface-container {selectedRangeOption === 'hoy' ? 'font-bold bg-primary/10 text-primary' : ''}">Hoy</button>
                    <button onclick={() => {selectedRangeOption = 'semana'; showDateRangeMenu = false;}} class="text-left px-3 py-2 rounded-lg text-body-sm hover:bg-surface-container {selectedRangeOption === 'semana' ? 'font-bold bg-primary/10 text-primary' : ''}">Esta Semana</button>
                    <button onclick={() => {selectedRangeOption = 'mes'; showDateRangeMenu = false;}} class="text-left px-3 py-2 rounded-lg text-body-sm hover:bg-surface-container {selectedRangeOption === 'mes' ? 'font-bold bg-primary/10 text-primary' : ''}">Últimos 30 días</button>
                    <button onclick={() => selectedRangeOption = 'personalizado'} class="text-left px-3 py-2 rounded-lg text-body-sm hover:bg-surface-container {selectedRangeOption === 'personalizado' ? 'font-bold bg-primary/10 text-primary' : ''}">Personalizado...</button>
                    
                    {#if selectedRangeOption === 'personalizado'}
                        <div class="mt-2 pt-2 border-t border-outline-variant flex flex-col gap-2">
                            <div>
                                <label class="text-[10px] font-bold text-outline uppercase block mb-1">Desde</label>
                                <input type="date" bind:value={customStart} class="w-full text-sm bg-surface-container-lowest border border-outline-variant rounded p-1 outline-none">
                            </div>
                            <div>
                                <label class="text-[10px] font-bold text-outline uppercase block mb-1">Hasta</label>
                                <input type="date" bind:value={customEnd} class="w-full text-sm bg-surface-container-lowest border border-outline-variant rounded p-1 outline-none">
                            </div>
                            <button onclick={() => showDateRangeMenu = false} class="w-full bg-primary text-on-primary text-xs font-bold py-1.5 rounded mt-1">Aplicar</button>
                        </div>
                    {/if}
                </div>
            {/if}

            <button onclick={handleExport} disabled={isExporting} class="flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded-lg text-label-md hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50">
                {#if isExporting}
                    <span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                {:else}
                    <span class="material-symbols-outlined text-[18px]">download</span>
                {/if}
                Exportar
            </button>
        </div>
    </div>

    <!-- Primary KPI Grid -->
    {#if isAdministrador}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg mb-2xl">
        <!-- Card 1: Total Clientes -->
        <div class="glass-card p-xl rounded-xl relative overflow-hidden group hover:border-primary/50 transition-all shadow-sm">
            <div class="flex justify-between items-start mb-md">
                <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                    <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">groups</span>
                </div>
                {#if nuevosEstaSemana > 0}
                    <span class="text-primary text-label-sm font-bold flex items-center gap-xs bg-primary/5 px-sm py-1 rounded-full animate-pulse">
                        +{nuevosEstaSemana} esta semana
                    </span>
                {/if}
            </div>
            <h3 class="text-label-md text-on-surface-variant mb-xs">Clientes Totales</h3>
            <div class="flex items-baseline gap-sm">
                {#if loading}
                    <span class="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                {:else}
                    <span class="text-display-lg font-display-lg">{totalClientesActivos}</span>
                {/if}
            </div>
            <div class="absolute bottom-0 left-0 w-full h-1 bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
        </div>

        <!-- Card 2: Visitas Físicas (Recepción) -->
        <div class="glass-card p-xl rounded-xl relative overflow-hidden group hover:border-secondary/50 transition-all shadow-sm">
            <div class="flex justify-between items-start mb-md">
                <div class="w-10 h-10 bg-secondary-container/20 rounded-lg flex items-center justify-center text-secondary">
                    <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">sensor_door</span>
                </div>
                <span class="text-secondary text-label-sm font-bold flex items-center gap-xs bg-secondary/5 px-sm py-1 rounded-full">
                    Visitas Físicas
                </span>
            </div>
            <h3 class="text-label-md text-on-surface-variant mb-xs">Clientes en Recepción</h3>
            <div class="flex items-baseline gap-sm">
                {#if loading}
                    <span class="material-symbols-outlined animate-spin text-secondary">progress_activity</span>
                {:else}
                    <span class="text-display-lg font-display-lg">{totalVisitasRecepcion}</span>
                {/if}
            </div>
            <div class="absolute bottom-0 left-0 w-full h-1 bg-secondary scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
        </div>

        <!-- Card 3: Casos Activos (Pendiente Firebase) -->
        <div class="glass-card p-xl rounded-xl relative overflow-hidden group hover:border-primary/50 transition-all shadow-sm">
            <div class="flex justify-between items-start mb-md">
                <div class="w-10 h-10 bg-primary-fixed-dim/20 rounded-lg flex items-center justify-center text-primary">
                    <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">folder</span>
                </div>
                <span class="text-on-surface-variant text-label-sm font-bold bg-surface-container px-sm py-1 rounded-full">Próximamente</span>
            </div>
            <h3 class="text-label-md text-on-surface-variant mb-xs">Casos Activos</h3>
            <div class="flex items-baseline gap-sm">
                <span class="text-display-lg font-display-lg text-on-surface-variant/40">--</span>
            </div>
            <div class="absolute bottom-0 left-0 w-full h-1 bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
        </div>

        <!-- Card 4: Audiencias (Pendiente Firebase) -->
        <div class="glass-card p-xl rounded-xl relative overflow-hidden group hover:border-secondary/50 transition-all shadow-sm bg-gradient-to-br from-white to-secondary-fixed/5">
            <div class="flex justify-between items-start mb-md">
                <div class="w-10 h-10 bg-secondary/10 rounded-lg flex items-center justify-center text-secondary">
                    <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">event_available</span>
                </div>
                <span class="text-primary text-label-sm font-bold flex items-center gap-xs bg-primary/5 px-sm py-1 rounded-full">Próximamente</span>
            </div>
            <h3 class="text-label-md text-on-surface-variant mb-xs">Audiencias Hoy</h3>
            <div class="flex items-baseline gap-sm">
                <span class="text-display-lg font-display-lg text-on-surface-variant/40">--</span>
            </div>
            <div class="absolute bottom-0 left-0 w-full h-1 bg-secondary scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
        </div>
    </div>
    {/if}

    <!-- Main Dashboard Layout: Bento Style -->
    <div class="grid grid-cols-12 gap-lg items-start">
        
        <!-- Left Column: Big Data & Stats -->
        <div class="col-span-12 lg:col-span-8 space-y-lg">
            
            <div class="bg-white border border-outline-variant rounded-xl p-lg shadow-sm">
                <div class="flex justify-between items-center mb-xl">
                    <h4 class="text-headline-md font-bold">Nuevos Clientes Recientes</h4>
                    <button onclick={() => goto('/dashboard/clientes')} class="text-primary font-bold text-label-md flex items-center gap-xs hover:underline">
                        Ver Directorio <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                </div>

                {#if loading}
                    <div class="flex justify-center items-center h-32">
                        <span class="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                    </div>
                {:else if clientes.length === 0}
                    <div class="text-center py-xl text-on-surface-variant">
                        <p>No hay clientes registrados aún.</p>
                    </div>
                {:else}
                    <div class="space-y-sm">
                        {#each clientes.slice(0, 5) as cliente}
                            <div class="flex justify-between items-center p-md bg-surface-container-lowest border border-outline-variant rounded-xl hover:bg-surface-container-low transition-colors">
                                <div class="flex items-center gap-md">
                                    <div class="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold">
                                        {cliente.nombreCompleto.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p class="font-bold text-body-lg text-on-surface">{cliente.nombreCompleto}</p>
                                        <p class="text-label-sm text-on-surface-variant flex items-center gap-xs mt-1">
                                            <span class="material-symbols-outlined text-[14px]">call</span> {cliente.telefono}
                                        </p>
                                    </div>
                                </div>
                                <div class="text-right">
                                    {#if cliente.origen === 'recepcion'}
                                        <span class="px-sm py-xs rounded bg-secondary-container/40 text-on-secondary-container text-label-sm font-bold flex items-center gap-xs">
                                            <span class="material-symbols-outlined text-[14px]">desk</span> Registrado en Recepción
                                        </span>
                                    {:else}
                                        <span class="px-sm py-xs rounded bg-surface-container-high text-on-surface text-label-sm font-bold flex items-center gap-xs">
                                            <span class="material-symbols-outlined text-[14px]">language</span> Vía Digital
                                        </span>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            {#if isAdministrador}
            <!-- Salud Financiera Widget -->
            <div class="bg-white border border-outline-variant rounded-xl p-lg shadow-sm">
                <div class="flex justify-between items-center mb-xl">
                    <h4 class="text-headline-md font-bold">Salud Financiera del Mes</h4>
                    <button onclick={() => goto('/dashboard/cuentas')} class="text-primary font-bold text-label-md flex items-center gap-xs hover:underline">
                        Ver Detalles <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-md">
                    <!-- Ingresos -->
                    <div class="p-md rounded-xl bg-surface-container-lowest border border-outline-variant/50">
                        <div class="flex items-center gap-xs text-primary mb-sm font-bold text-label-sm uppercase">
                            <span class="material-symbols-outlined text-[16px]">trending_up</span> Ingresos
                        </div>
                        <p class="text-headline-lg font-bold text-on-surface">
                            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(ingresosMes)}
                        </p>
                    </div>

                    <!-- Egresos -->
                    <div class="p-md rounded-xl bg-surface-container-lowest border border-outline-variant/50">
                        <div class="flex items-center gap-xs text-error mb-sm font-bold text-label-sm uppercase">
                            <span class="material-symbols-outlined text-[16px]">trending_down</span> Egresos
                        </div>
                        <p class="text-headline-lg font-bold text-on-surface">
                            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(egresosMes)}
                        </p>
                    </div>

                    <!-- Utilidad -->
                    <div class="p-md rounded-xl {utilidadMes >= 0 ? 'bg-primary/10 border-primary/30' : 'bg-error/10 border-error/30'} border">
                        <div class="flex items-center gap-xs {utilidadMes >= 0 ? 'text-primary' : 'text-error'} mb-sm font-bold text-label-sm uppercase">
                            <span class="material-symbols-outlined text-[16px]">account_balance</span> Utilidad Neta
                        </div>
                        <p class="text-headline-lg font-bold {utilidadMes >= 0 ? 'text-primary' : 'text-error'}">
                            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(utilidadMes)}
                        </p>
                    </div>
                </div>

                <div class="mt-lg p-md bg-surface-container-low rounded-xl border border-outline-variant flex items-center justify-between">
                    <div>
                        <p class="font-bold text-label-md text-on-surface">Acceso Rápido</p>
                        <p class="text-label-sm text-on-surface-variant">Registra un gasto al instante desde tu celular o PC.</p>
                    </div>
                    <button onclick={() => goto('/dashboard/cuentas')} class="bg-primary text-on-primary p-2 rounded-lg hover:opacity-90 flex items-center shadow-md">
                        <span class="material-symbols-outlined">add_circle</span>
                    </button>
                </div>
            </div>
            {/if}
        </div>

        <!-- Right Column: Daily Agenda -->
        <div class="col-span-12 lg:col-span-4 space-y-lg">
            <div class="bg-surface-container-low border border-outline-variant rounded-xl p-lg shadow-sm flex flex-col h-full min-h-[600px] overflow-hidden">
                <div class="flex justify-between items-center mb-lg">
                    <h4 class="text-headline-md font-bold">Agenda de Hoy</h4>
                    <span class="bg-primary/10 text-primary font-bold text-label-sm px-2 py-1 rounded-full">{eventosHoy.length} eventos</span>
                </div>
                
                <div class="space-y-sm overflow-y-auto flex-1">
                    {#if eventosHoy.length === 0}
                        <div class="h-full flex flex-col items-center justify-center text-on-surface-variant opacity-60 p-xl text-center">
                            <span class="material-symbols-outlined text-[48px] mb-sm">event_available</span>
                            <p class="font-bold">Día libre</p>
                            <p class="text-body-md mt-xs">No hay eventos programados para hoy.</p>
                            <button onclick={() => goto('/dashboard/calendario')} class="mt-md text-primary font-bold hover:underline">Ir al Calendario</button>
                        </div>
                    {:else}
                        {#each eventosHoy as ev}
                            {@const evDate = ev.fechaHora.toDate ? ev.fechaHora.toDate() : new Date(ev.fechaHora)}
                            {@const esRelevante = isEventoRelevante(ev)}
                            {@const expiring = isExpiring(ev.fechaHora) && ev.estado !== 'Completado' && esRelevante}
                            
                            <div class="rounded-xl border {expiring ? 'border-error bg-error/5 shadow-md' : 'border-outline-variant bg-surface'} p-sm flex flex-col gap-xs relative overflow-hidden group transition-all {esRelevante ? '' : 'opacity-60 scale-[0.98] grayscale-[20%] hover:opacity-100 hover:scale-100'}">
                                {#if expiring}
                                    <div class="absolute top-0 left-0 w-1 h-full bg-error animate-pulse"></div>
                                {/if}
                                
                                <div class="flex justify-between items-start pl-xs">
                                    <div class="flex items-center gap-xs">
                                        <span class="material-symbols-outlined text-[16px] text-on-surface-variant">
                                            {ev.tipo === 'Audiencia' ? 'gavel' : ev.tipo === 'Reunión Cliente' ? 'handshake' : 'event'}
                                        </span>
                                        <span class="text-label-sm font-bold text-on-surface-variant">{ev.tipo}</span>
                                        {#if !esRelevante}
                                            <span class="text-[9px] bg-surface-container-high px-1 rounded-sm text-on-surface-variant font-bold ml-1 uppercase">De equipo</span>
                                        {/if}
                                    </div>
                                    <span class="text-label-sm font-bold bg-surface-container px-sm py-[2px] rounded-md text-on-surface {expiring ? 'text-error' : ''}">
                                        {evDate.toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                </div>
                                
                                <h4 class="font-bold text-body-lg {expiring ? 'text-error' : 'text-on-surface'} pl-xs">
                                    {ev.titulo}
                                </h4>
                                
                                <div class="mt-xs pt-xs border-t border-outline-variant/30 flex justify-between items-center pl-xs">
                                    <div class="flex items-center gap-xs text-label-sm text-on-surface-variant">
                                        <span class="material-symbols-outlined text-[14px]">badge</span>
                                        {#if ev.asignadoA === $authStore.user?.uid}
                                            Para mí
                                        {:else if ev.asignadoA === 'todos'}
                                            Todo el equipo
                                        {:else}
                                            {@const emp = empleados.find(e => e.id === ev.asignadoA)}
                                            {emp ? emp.nombre : 'De equipo'}
                                        {/if}
                                    </div>
                                    <span class="text-[10px] font-bold px-2 py-1 rounded-full {ev.estado === 'Completado' ? 'bg-primary/20 text-primary' : 'bg-surface-container-high text-on-surface-variant'}">
                                        {ev.estado}
                                    </span>
                                </div>

                                <!-- Acciones Rápidas -->
                                <div class="absolute inset-y-0 right-0 bg-surface/90 backdrop-blur-sm p-sm flex items-center gap-xs translate-x-full group-hover:translate-x-0 transition-transform shadow-l">
                                    {#if ev.estado !== 'Completado'}
                                        <button onclick={() => updateEvento(ev.id, {estado: 'Completado'})} class="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center hover:opacity-90" title="Completar">
                                            <span class="material-symbols-outlined text-[16px]">check</span>
                                        </button>
                                    {/if}
                                    <button onclick={() => goto('/dashboard/calendario')} class="w-8 h-8 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center hover:opacity-90" title="Ver en Calendario">
                                        <span class="material-symbols-outlined text-[16px]">open_in_new</span>
                                    </button>
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Floating Action Button -->
<button onclick={() => goto('/dashboard/clientes')} class="fixed bottom-margin-desktop right-margin-desktop w-14 h-14 bg-secondary text-on-secondary rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-50 group">
    <span class="material-symbols-outlined text-[32px] group-hover:rotate-90 transition-transform">person_add</span>
</button>


