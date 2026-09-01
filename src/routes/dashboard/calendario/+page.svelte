<script>
    import { onMount, onDestroy } from 'svelte';
    import { subscribeToAgenda, addEvento, deleteEvento, updateEvento } from '$lib/firebase/agenda.js';
    import { subscribeToEmpleados } from '$lib/firebase/empleados.js';
    import { subscribeToClientes } from '$lib/firebase/clientes.js';
    import { authStore } from '$lib/stores/auth.js';

    let eventos = $state([]);
    let empleados = $state([]);
    let clientes = $state([]);
    let unsubs = [];
    let currentUserEmail = $state('');

    let currentEmpleado = $derived(empleados.find(e => e.authUid === $authStore.user?.uid));
    let isAdministrador = $derived(!currentEmpleado || currentEmpleado.rol === 'Administrador');

    let eventosPermitidos = $derived(eventos.filter(ev => {
        if (isAdministrador) return true;
        // Si es empleado normal, solo ve los asignados a él o a todos
        return currentEmpleado && (ev.asignadoA === currentEmpleado.id || ev.asignadoA === 'todos');
    }));

    // Calendar state
    let currentDate = $state(new Date()); 
    let selectedDate = $state(new Date()); 
    
    // Derived calendar data
    let daysInMonth = $derived(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate());
    let firstDayOfWeek = $derived(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()); 
    
    let daysArray = $derived.by(() => {
        let arr = [];
        for(let i = 0; i < firstDayOfWeek; i++) {
            arr.push(null);
        }
        for(let i = 1; i <= daysInMonth; i++) {
            arr.push(i);
        }
        return arr;
    });

    // Modal state
    let showModal = $state(false);
    let isSubmitting = $state(false);
    let customTipo = $state('');
    let formData = $state({
        titulo: '',
        tipo: 'Audiencia',
        fecha: '', 
        hora: '', 
        asignadoA: 'mi', 
        clienteId: '',
        notas: ''
    });

    onMount(() => {
        if ($authStore.user) {
            currentUserEmail = $authStore.user.email;
        }
        unsubs.push(subscribeToAgenda(data => eventos = data));
        unsubs.push(subscribeToEmpleados(data => empleados = data));
        unsubs.push(subscribeToClientes(data => clientes = data.filter(c => c.estado === 'Activo')));
        
        // Request Notification Permission
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
    });

    onDestroy(() => {
        unsubs.forEach(u => u());
    });

    function getEventsForDate(day, month, year) {
        return eventosPermitidos.filter(ev => {
            const evDate = ev.fechaHora.toDate ? ev.fechaHora.toDate() : new Date(ev.fechaHora);
            return evDate.getDate() === day && evDate.getMonth() === month && evDate.getFullYear() === year;
        });
    }

    let selectedDateEvents = $derived(getEventsForDate(selectedDate.getDate(), selectedDate.getMonth(), selectedDate.getFullYear()));

    function prevMonth() {
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    }
    
    function nextMonth() {
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    }

    function selectDate(day) {
        if (!day) return;
        selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    }

    function isSameDate(d1, d2) {
        return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
    }
    
    function isToday(day, month, year) {
        const today = new Date();
        return today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
    }

    function openModal() {
        const yyyy = selectedDate.getFullYear();
        const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(selectedDate.getDate()).padStart(2, '0');
        
        customTipo = '';
        formData = {
            titulo: '',
            tipo: 'Audiencia',
            fecha: `${yyyy}-${mm}-${dd}`,
            hora: '10:00',
            asignadoA: 'mi', // Default to current user
            clienteId: '',
            notas: ''
        };
        showModal = true;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        isSubmitting = true;
        
        const [year, month, day] = formData.fecha.split('-');
        const [hours, minutes] = formData.hora.split(':');
        const fechaHora = new Date(year, month - 1, day, hours, minutes);
        
        const tipoFinal = formData.tipo === 'Otro' ? customTipo : formData.tipo;

        let finalAsignado = formData.asignadoA;
        if (finalAsignado === 'mi') {
            finalAsignado = currentEmpleado ? currentEmpleado.id : $authStore.user?.uid;
        }

        try {
            await addEvento({
                ...formData,
                asignadoA: finalAsignado,
                tipo: tipoFinal,
                fechaHora,
                estado: 'Pendiente',
                creadoPor: $authStore.user?.uid
            });
            showModal = false;
        } catch(error) {
            console.error(error);
            alert("Error al guardar el evento");
        } finally {
            isSubmitting = false;
        }
    }

    function isEventoRelevante(ev) {
        if (!isAdministrador) return true; // Para el empleado, todo lo que ve es relevante
        return ev.asignadoA === $authStore.user?.uid || ev.asignadoA === 'todos';
    }

    function getTipoIcon(tipo) {
        switch(tipo) {
            case 'Audiencia': return 'gavel';
            case 'Reunión Cliente': return 'handshake';
            case 'Trámite': return 'assignment';
            case 'Tarea Interna': return 'task';
            default: return 'event';
        }
    }

    function getTipoColor(tipo) {
        switch(tipo) {
            case 'Audiencia': return 'bg-error-container text-on-error-container border-error/30';
            case 'Reunión Cliente': return 'bg-secondary-container text-on-secondary-container border-secondary/30';
            case 'Trámite': return 'bg-surface-variant text-on-surface-variant border-outline/30';
            case 'Tarea Interna': return 'bg-primary-container text-on-primary-container border-primary/30';
            default: return 'bg-surface-container-high text-on-surface border-outline/30';
        }
    }
    
    function isExpiring(evDate) {
        const now = new Date();
        const diff = evDate.getTime() - now.getTime();
        return diff > 0 && diff < (24 * 60 * 60 * 1000);
    }
</script>

<div class="p-lg space-y-lg max-w-[1440px] mx-auto w-full h-full flex flex-col">
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-md">
        <div>
            <h2 class="font-headline-xl text-headline-xl text-on-surface">Calendario Jurídico</h2>
            <p class="font-body-md text-body-md text-on-surface-variant mt-xs">Gestiona tu agenda, asigna tareas al equipo y monitorea vencimientos.</p>
        </div>
        <button onclick={openModal} class="flex items-center gap-xs px-md py-sm bg-primary text-on-primary hover:bg-primary/90 rounded-lg font-bold text-label-md transition-all shadow-sm">
            <span class="material-symbols-outlined text-[18px]">add</span> 
            Nueva Actividad
        </button>
    </div>

    <!-- Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-lg flex-1 min-h-0">
        
        <!-- Left: Month Calendar -->
        <div class="lg:col-span-2 glass-card rounded-2xl p-lg flex flex-col shadow-sm">
            <!-- Calendar Controls -->
            <div class="flex justify-between items-center mb-lg">
                <h3 class="font-headline-md font-bold text-on-surface capitalize">
                    {currentDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
                </h3>
                <div class="flex gap-sm">
                    <button onclick={prevMonth} class="p-sm hover:bg-surface-container rounded-full transition-colors flex items-center justify-center">
                        <span class="material-symbols-outlined">chevron_left</span>
                    </button>
                    <button onclick={() => currentDate = new Date()} class="px-md py-xs text-label-sm font-bold bg-surface-container-high hover:bg-surface-container-highest rounded-lg transition-colors">
                        HOY
                    </button>
                    <button onclick={nextMonth} class="p-sm hover:bg-surface-container rounded-full transition-colors flex items-center justify-center">
                        <span class="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>
            </div>

            <!-- Weekdays -->
            <div class="grid grid-cols-7 gap-xs mb-sm">
                {#each ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as day}
                    <div class="text-center text-label-sm font-bold text-on-surface-variant uppercase">{day}</div>
                {/each}
            </div>

            <!-- Days Grid -->
            <div class="grid grid-cols-7 gap-xs flex-1">
                {#each daysArray as day}
                    {#if day === null}
                        <div class="rounded-xl bg-transparent"></div>
                    {:else}
                        {@const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)}
                        {@const isSelected = isSameDate(dateObj, selectedDate)}
                        {@const isTodayDate = isToday(day, currentDate.getMonth(), currentDate.getFullYear())}
                        {@const dayEvents = getEventsForDate(day, currentDate.getMonth(), currentDate.getFullYear())}
                        
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div onclick={() => selectDate(day)} 
                             class="rounded-xl border flex flex-col p-xs cursor-pointer transition-all h-24 overflow-hidden
                             {isSelected ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-outline-variant/30 hover:border-primary/50 hover:bg-surface-container-lowest'}
                             {isTodayDate ? 'bg-secondary-container/10 border-secondary/30' : 'bg-white'}">
                             
                            <div class="flex justify-between items-start mb-1">
                                <span class="text-label-md font-bold {isTodayDate ? 'bg-secondary text-on-secondary rounded-full w-6 h-6 flex items-center justify-center' : 'text-on-surface'}">
                                    {day}
                                </span>
                                {#if dayEvents.length > 0}
                                    <span class="text-[10px] font-bold text-on-surface-variant bg-surface-container px-1 rounded-sm">{dayEvents.length}</span>
                                {/if}
                            </div>
                            
                            <!-- Event Indicators -->
                            <div class="flex flex-col gap-[2px] mt-auto">
                                {#each dayEvents.slice(0, 3) as ev}
                                    <div class="text-[10px] truncate px-1 rounded-sm border {getTipoColor(ev.tipo)} font-medium" title={ev.titulo}>
                                        {ev.titulo}
                                    </div>
                                {/each}
                                {#if dayEvents.length > 3}
                                    <div class="text-[10px] text-on-surface-variant text-center font-bold">+{dayEvents.length - 3} más</div>
                                {/if}
                            </div>
                        </div>
                    {/if}
                {/each}
            </div>
        </div>

        <!-- Right: Daily Agenda -->
        <div class="glass-card rounded-2xl flex flex-col shadow-sm overflow-hidden h-[800px] lg:h-auto">
            <div class="p-lg bg-surface-container-low border-b border-outline-variant flex justify-between items-center">
                <div>
                    <h3 class="font-headline-md font-bold text-on-surface">Agenda Diaria</h3>
                    <p class="text-label-sm text-on-surface-variant capitalize">{selectedDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-md space-y-sm bg-surface-container-lowest">
                {#if selectedDateEvents.length === 0}
                    <div class="h-full flex flex-col items-center justify-center text-on-surface-variant opacity-60 p-xl text-center">
                        <span class="material-symbols-outlined text-[48px] mb-sm">event_available</span>
                        <p class="font-bold">Día libre</p>
                        <p class="text-body-md mt-xs">No hay eventos programados para esta fecha.</p>
                    </div>
                {:else}
                    {#each selectedDateEvents as ev (ev.id)}
                        {@const evDate = ev.fechaHora.toDate ? ev.fechaHora.toDate() : new Date(ev.fechaHora)}
                        {@const esRelevante = isEventoRelevante(ev)}
                        {@const expiring = isExpiring(evDate) && ev.estado !== 'Completado' && esRelevante}
                        
                        <div class="rounded-xl border {expiring ? 'border-error/50 bg-error/5' : 'border-outline-variant bg-surface'} p-sm flex flex-col gap-xs relative overflow-hidden group {esRelevante ? '' : 'opacity-60 scale-[0.98] grayscale-[20%] hover:opacity-100 hover:scale-100 transition-all duration-300'}">
                            {#if expiring}
                                <div class="absolute top-0 left-0 w-1 h-full bg-error"></div>
                            {/if}
                            <div class="flex justify-between items-start pl-xs">
                                <div class="flex items-center gap-xs">
                                    <span class="material-symbols-outlined text-[16px] text-on-surface-variant">{getTipoIcon(ev.tipo)}</span>
                                    <span class="text-label-sm font-bold text-on-surface-variant">{ev.tipo}</span>
                                    {#if !esRelevante}
                                        <span class="text-[9px] bg-surface-container-high px-1 rounded-sm text-on-surface-variant font-bold ml-1 uppercase">De equipo</span>
                                    {/if}
                                </div>
                                <span class="text-label-sm font-bold bg-surface-container px-sm py-[2px] rounded-md text-on-surface">
                                    {evDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            
                            <h4 class="font-bold text-body-lg text-on-surface pl-xs {expiring ? 'text-error' : ''}">
                                {ev.titulo}
                            </h4>
                            
                            {#if ev.clienteId}
                                {@const clienteInfo = clientes.find(c => c.id === ev.clienteId)}
                                {#if clienteInfo}
                                    <div class="flex items-center gap-xs text-label-sm text-secondary pl-xs">
                                        <span class="material-symbols-outlined text-[14px]">person</span>
                                        {clienteInfo.nombreCompleto}
                                    </div>
                                {/if}
                            {/if}

                            <div class="mt-sm pt-sm border-t border-outline-variant/30 flex justify-between items-center pl-xs">
                                <div class="flex items-center gap-xs text-label-sm text-on-surface-variant">
                                    <span class="material-symbols-outlined text-[14px]">badge</span>
                                    {#if ev.asignadoA === 'mi'}
                                        Para mí
                                    {:else if ev.asignadoA === 'todos'}
                                        Todo el equipo
                                    {:else}
                                        {@const emp = empleados.find(e => e.id === ev.asignadoA)}
                                        {emp ? emp.nombre : 'Desconocido'}
                                    {/if}
                                </div>
                                <span class="text-[10px] font-bold px-2 py-1 rounded-full {ev.estado === 'Completado' ? 'bg-primary/20 text-primary' : 'bg-surface-container-high text-on-surface-variant'}">
                                    {ev.estado}
                                </span>
                            </div>
                            
                            <!-- Hover actions -->
                            <div class="absolute inset-y-0 right-0 bg-surface/90 backdrop-blur-sm p-sm flex items-center gap-xs translate-x-full group-hover:translate-x-0 transition-transform shadow-l">
                                {#if ev.estado !== 'Completado'}
                                    <button onclick={() => updateEvento(ev.id, {estado: 'Completado'})} class="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center hover:opacity-90" title="Marcar completado">
                                        <span class="material-symbols-outlined text-[16px]">check</span>
                                    </button>
                                {/if}
                                <button onclick={() => deleteEvento(ev.id)} class="w-8 h-8 rounded-full bg-error-container text-on-error-container flex items-center justify-center hover:opacity-90" title="Eliminar evento">
                                    <span class="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
</div>

<!-- Modal Nuevo Evento -->
{#if showModal}
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-on-background/40 backdrop-blur-sm p-4">
        <div class="bg-surface rounded-2xl w-[95vw] max-w-[600px] shadow-2xl overflow-hidden border border-outline-variant animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div class="px-lg py-md bg-primary-container text-on-primary-container flex justify-between items-center shrink-0">
                <div class="flex items-center gap-sm">
                    <span class="material-symbols-outlined">event_note</span>
                    <h3 class="font-headline-md font-bold">Programar Actividad</h3>
                </div>
                <button onclick={() => showModal = false} class="hover:bg-black/10 p-xs rounded-full transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <div class="p-lg overflow-y-auto">
                <form onsubmit={handleSubmit} class="space-y-md">
                    <div class="space-y-xs">
                        <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Título del Evento *</label>
                        <input type="text" bind:value={formData.titulo} required placeholder="Ej. Audiencia Caso Martínez" class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                    </div>

                    <div class="grid grid-cols-2 gap-md">
                        <div class="space-y-xs">
                            <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Fecha *</label>
                            <input type="date" bind:value={formData.fecha} required class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                        </div>
                        <div class="space-y-xs">
                            <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Hora *</label>
                            <input type="time" bind:value={formData.hora} required class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-md">
                        <div class="space-y-xs flex flex-col h-full">
                            <label for="tipoActividad" class="block text-label-sm text-on-surface-variant font-bold uppercase">Tipo de Actividad</label>
                            <select id="tipoActividad" bind:value={formData.tipo} class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 mb-xs">
                                <option value="Audiencia">Audiencia (Tribunal)</option>
                                <option value="Reunión Cliente">Reunión con Cliente</option>
                                <option value="Trámite">Trámite Legal</option>
                                <option value="Tarea Interna">Tarea Interna</option>
                                <option value="Otro">Otro (Personalizado)</option>
                            </select>
                            {#if formData.tipo === 'Otro'}
                                <input type="text" bind:value={customTipo} required placeholder="Ej. Mediación" class="w-full mt-1 bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 animate-in fade-in">
                            {/if}
                        </div>
                        <div class="space-y-xs">
                            <label for="asignadoA" class="block text-label-sm text-on-surface-variant font-bold uppercase">Asignar a...</label>
                            <select id="asignadoA" bind:value={formData.asignadoA} class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                                <option value="mi">A Mí (Cuenta actual)</option>
                                <option value="todos">Todo el Equipo</option>
                                {#each empleados as emp}
                                    <option value={emp.id}>{emp.nombre} ({emp.rol})</option>
                                {/each}
                            </select>
                        </div>
                    </div>

                    <div class="space-y-xs">
                        <label for="clienteId" class="block text-label-sm text-on-surface-variant font-bold uppercase">Vincular Cliente (Opcional)</label>
                        <select id="clienteId" bind:value={formData.clienteId} class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                            <option value="">-- Ninguno --</option>
                            {#each clientes as cliente}
                                <option value={cliente.id}>{cliente.nombreCompleto}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="space-y-xs">
                        <label for="notas" class="block text-label-sm text-on-surface-variant font-bold uppercase">Notas / Detalles</label>
                        <textarea id="notas" bind:value={formData.notas} rows="3" placeholder="Llevar documentos originales..." class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20"></textarea>
                    </div>

                    <div class="pt-md flex justify-end gap-sm border-t border-outline-variant mt-md">
                        <button type="button" onclick={() => showModal = false} class="px-md py-sm rounded-lg font-bold text-on-surface-variant hover:bg-surface-container transition-all">
                            Cancelar
                        </button>
                        <button type="submit" disabled={isSubmitting} class="px-md py-sm rounded-lg font-bold bg-primary text-on-primary shadow-md hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-xs">
                            {#if isSubmitting}
                                <span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                            {:else}
                                <span class="material-symbols-outlined text-[18px]">save</span>
                            {/if}
                            Guardar Actividad
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}
