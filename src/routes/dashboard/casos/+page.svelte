<script>
    import { onMount, onDestroy } from 'svelte';
    import { subscribeToCasos, addCaso, updateCaso, registrarAvance, deleteCaso } from '$lib/firebase/casos.js';
    import { subscribeToClientes } from '$lib/firebase/clientes.js';
    import { subscribeToEmpleados } from '$lib/firebase/empleados.js';
    import { authStore } from '$lib/stores/auth.js';
    
    // Store Subscriptions
    let casos = $state([]);
    let clientes = $state([]);
    let empleados = $state([]);
    let loading = $state(true);
    let unsubC = null;
    let unsubCli = null;
    let unsubEmp = null;

    // Computed
    let columnas = ['Pendiente Docs', 'En Proceso', 'Adentro', 'Finalizado'];
    
    // Search & Filter
    let searchQuery = $state('');
    let casosFiltrados = $derived(casos.filter(c => 
        (c.titulo?.toLowerCase().includes(searchQuery.toLowerCase())) || 
        (c.clienteNombre?.toLowerCase().includes(searchQuery.toLowerCase()))
    ));

    onMount(() => {
        unsubC = subscribeToCasos(data => { casos = data; loading = false; });
        unsubCli = subscribeToClientes(data => clientes = data);
        unsubEmp = subscribeToEmpleados(data => empleados = data);
    });

    onDestroy(() => {
        if(unsubC) unsubC();
        if(unsubCli) unsubCli();
        if(unsubEmp) unsubEmp();
    });

    // Helper: Is Deadline Passed?
    function isOverdue(fechaLimiteStr) {
        if (!fechaLimiteStr) return false;
        const limite = new Date(fechaLimiteStr);
        const hoy = new Date();
        return limite < hoy;
    }

    // Modal: Nuevo Caso
    let isModalOpen = $state(false);
    let isSubmitting = $state(false);
    
    // Form fields
    let formTitulo = $state('');
    let formDescripcion = $state('');
    let formTipo = $state('Civil');
    let formFechaLimite = $state('');
    let formClienteId = $state('');

    async function handleAddCaso(e) {
        e.preventDefault();
        if (!formClienteId || !formTitulo) return alert("Llena los campos obligatorios");

        isSubmitting = true;
        try {
            const clienteSelect = clientes.find(c => c.id === formClienteId);
            await addCaso({
                titulo: formTitulo,
                descripcion: formDescripcion,
                tipo: formTipo,
                clienteId: clienteSelect.id,
                clienteNombre: clienteSelect.nombreCompleto,
                fechaLimite: formFechaLimite || null,
                abogadoEncargado: $authStore.user?.uid
            });
            isModalOpen = false;
            // Reset
            formTitulo = ''; formDescripcion = ''; formFechaLimite = ''; formClienteId = '';
        } catch (error) {
            console.error(error);
            alert("Error al crear caso");
        } finally {
            isSubmitting = false;
        }
    }

    // Side Panel: Caso Details (Timeline)
    let selectedCaso = $state(null);
    let isSidePanelOpen = $state(false);

    function openCasoDetails(caso) {
        selectedCaso = caso;
        isSidePanelOpen = true;
    }

    async function changeEstado(newEstado) {
        if (!selectedCaso) return;
        await updateCaso(selectedCaso.id, { estado: newEstado });
        // Optionally auto-register timeline event for state change
        await registrarAvance(selectedCaso.id, {
            descripcion: `El estado del caso cambió a: ${newEstado}`,
            tipo: 'Estado',
            creadoPor: $authStore.user?.uid
        });
        selectedCaso.estado = newEstado; // Local reactive update
    }

    // Nuevo Avance Form
    let formAvanceDesc = $state('');
    let formAvanceTipo = $state('Nota');
    let formAvanceFechaProgramada = $state(''); // If Audiencia/Plazo
    let isSubmittingAvance = $state(false);

    async function handleAddAvance(e) {
        e.preventDefault();
        if (!formAvanceDesc) return;
        isSubmittingAvance = true;
        try {
            let programar = null;
            if (formAvanceTipo === 'Audiencia' && formAvanceFechaProgramada) {
                programar = {
                    titulo: selectedCaso.titulo,
                    fechaHora: formAvanceFechaProgramada,
                    asignadoA: selectedCaso.abogadoEncargado
                };
            }
            await registrarAvance(selectedCaso.id, {
                descripcion: formAvanceDesc,
                tipo: formAvanceTipo,
                creadoPor: $authStore.user?.uid
            }, programar);
            
            formAvanceDesc = '';
            formAvanceFechaProgramada = '';
        } catch (error) {
            console.error(error);
            alert("Error al guardar avance");
        } finally {
            isSubmittingAvance = false;
        }
    }
    // Drag & Drop
    let draggedCaso = $state(null);
    let dragOverColumn = $state(null);

    async function handleDropCaso(caso, newEstado) {
        if (!caso || caso.estado === newEstado) return;
        
        const oldEstado = caso.estado;
        // Optimistic local update so it snaps instantly
        caso.estado = newEstado; 
        
        try {
            await updateCaso(caso.id, { estado: newEstado });
            await registrarAvance(caso.id, {
                descripcion: `El trámite se movió a la etapa: ${newEstado}`,
                tipo: 'Estado',
                creadoPor: $authStore.user?.uid
            });
        } catch (error) {
            console.error("Error al mover caso:", error);
            caso.estado = oldEstado; // revert if failed
            alert("Hubo un error al mover el caso. Intenta de nuevo.");
        }
    }
</script>

<div class="p-4 md:p-lg max-w-[1600px] mx-auto w-full h-full flex flex-col relative overflow-x-hidden">
    <!-- Top Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-end mb-xl gap-4">
        <div>
            <h2 class="font-headline-xl text-headline-xl text-on-surface tracking-tight flex items-center gap-2">
                <span class="material-symbols-outlined text-[32px] text-secondary-fixed-dim" style="font-variation-settings: 'FILL' 1;">folder_supervised</span>
                Trámites y Procesos
            </h2>
            <p class="text-body-md text-on-surface-variant">Gestor Kanban y línea de tiempo procesal.</p>
        </div>
        <div class="flex items-center gap-md w-full md:w-auto">
            <div class="relative w-full md:w-[300px]">
                <span class="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">search</span>
                <input bind:value={searchQuery} class="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-[48px] pr-md py-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" placeholder="Buscar caso o cliente..." type="text">
            </div>
            <button onclick={() => alert('Aún no disponible')} class="bg-surface-container-high text-on-surface-variant border border-outline-variant py-sm px-md rounded-xl font-bold flex items-center gap-2 hover:bg-surface-variant transition-all whitespace-nowrap cursor-not-allowed opacity-80" title="Aún no disponible">
                <span class="material-symbols-outlined text-[18px]">edit_document</span>
                Crear Memorial
            </button>
        </div>
    </div>

    <!-- Kanban Board -->
    <div class="flex-1 flex gap-md md:gap-lg overflow-x-auto custom-scrollbar pb-md">
        {#each columnas as col}
            {@const colCasos = casosFiltrados.filter(c => c.estado === col)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div 
                ondragover={(e) => { e.preventDefault(); dragOverColumn = col; }}
                ondragleave={() => dragOverColumn = null}
                ondrop={(e) => {
                    e.preventDefault();
                    if (draggedCaso) handleDropCaso(draggedCaso, col);
                    dragOverColumn = null;
                }}
                class="flex-shrink-0 w-[320px] md:w-[350px] border rounded-2xl flex flex-col overflow-hidden transition-all shadow-sm {dragOverColumn === col ? 'bg-primary/5 border-primary ring-2 ring-primary/20' : 'bg-surface-container-lowest/50 border-outline-variant/50'}"
            >
                
                <!-- Column Header -->
                <div class="p-md border-b border-outline-variant/50 flex justify-between items-center bg-surface-container-low">
                    <h3 class="font-bold text-label-md text-on-surface uppercase tracking-wider">{col}</h3>
                    <span class="bg-surface-container px-2 py-0.5 rounded-full text-label-sm font-bold text-on-surface-variant">{colCasos.length}</span>
                </div>
                
                <!-- Column Body -->
                <div class="p-sm flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-sm">
                    {#each colCasos as caso}
                        {@const overdue = caso.estado !== 'Finalizado' && isOverdue(caso.fechaLimite)}
                        {@const emp = empleados.find(e => e.authUid === caso.abogadoEncargado)}
                        
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div 
                            draggable="true"
                            ondragstart={(e) => { draggedCaso = caso; e.dataTransfer.effectAllowed = 'move'; }}
                            ondragend={() => draggedCaso = null}
                            onclick={() => openCasoDetails(caso)} 
                            class="bg-white border {overdue ? 'border-error/50 bg-error/5 shadow-error/10' : 'border-outline-variant hover:border-primary/50'} p-md rounded-xl shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all relative overflow-hidden group {draggedCaso?.id === caso.id ? 'opacity-50 scale-95' : 'opacity-100'}"
                        >
                            {#if overdue}
                                <div class="absolute top-0 left-0 w-1 h-full bg-error"></div>
                            {:else}
                                <div class="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            {/if}
                            
                            <div class="flex justify-between items-start mb-sm">
                                <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded {overdue ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-on-surface-variant'}">
                                    {caso.tipo}
                                </span>
                                {#if overdue}
                                    <span class="text-[10px] uppercase font-bold text-error flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[12px]">warning</span> Vencido
                                    </span>
                                {/if}
                            </div>
                            
                            <h4 class="font-bold text-body-lg text-on-surface mb-xs leading-tight line-clamp-2">{caso.titulo}</h4>
                            <p class="text-label-sm text-on-surface-variant mb-md flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px]">person</span> {caso.clienteNombre}
                            </p>
                            
                            <div class="flex justify-between items-center border-t border-outline-variant/30 pt-sm mt-auto">
                                <div class="flex -space-x-2">
                                    <div class="w-6 h-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-[10px] font-bold border border-white" title={emp?.nombre || 'Abogado'}>
                                        {(emp?.nombre || 'U').charAt(0).toUpperCase()}
                                    </div>
                                </div>
                                {#if caso.fechaLimite}
                                    <span class="text-[11px] font-bold {overdue ? 'text-error' : 'text-outline'} flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[14px]">event</span>
                                        {new Date(caso.fechaLimite).toLocaleDateString('es-MX', {day: '2-digit', month: 'short'})}
                                    </span>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    </div>
</div>

<!-- Side Panel: Timeline / Avances -->
{#if isSidePanelOpen && selectedCaso}
<div class="fixed inset-y-0 right-0 w-full md:w-[450px] bg-white shadow-2xl border-l border-outline-variant z-50 flex flex-col animation-slide-in">
    <!-- Header Panel -->
    <div class="p-lg border-b border-outline-variant bg-surface-container-lowest flex justify-between items-start shrink-0">
        <div>
            <span class="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest mb-xs inline-block">{selectedCaso.tipo}</span>
            <h3 class="font-bold text-headline-md text-on-surface leading-tight mb-2">{selectedCaso.titulo}</h3>
            <p class="text-label-sm text-on-surface-variant flex items-center gap-1">
                <span class="material-symbols-outlined text-[16px]">person</span> {selectedCaso.clienteNombre}
            </p>
        </div>
        <button onclick={() => isSidePanelOpen = false} class="p-2 hover:bg-surface-container rounded-full text-outline hover:text-on-surface transition-colors shrink-0">
            <span class="material-symbols-outlined">close_fullscreen</span>
        </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-lg bg-surface">
        <!-- Change Status -->
        <div class="mb-lg p-md bg-white border border-outline-variant rounded-xl shadow-sm">
            <label class="block text-label-sm font-bold text-outline uppercase mb-2">Estado Actual</label>
            <select 
                value={selectedCaso.estado} 
                onchange={(e) => changeEstado(e.target.value)} 
                class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 font-bold text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            >
                {#each columnas as col}
                    <option value={col}>{col}</option>
                {/each}
            </select>
        </div>

        <!-- Timeline -->
        <h4 class="font-bold text-label-md text-on-surface uppercase tracking-wider mb-md flex items-center gap-2">
            <span class="material-symbols-outlined">history</span> Línea de Tiempo
        </h4>
        
        <div class="space-y-md mb-xl pl-2 relative border-l-2 border-outline-variant/30 ml-2">
            {#if !selectedCaso.avances || selectedCaso.avances.length === 0}
                <p class="text-label-sm text-outline italic pl-4">No hay avances registrados aún.</p>
            {/if}
            
            {#each (selectedCaso.avances || []).slice().reverse() as avance}
                <div class="relative pl-6">
                    <!-- Timeline dot -->
                    <div class="absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full {avance.tipo === 'Audiencia' ? 'bg-error' : (avance.tipo === 'Estado' ? 'bg-secondary' : 'bg-primary')} border-2 border-white shadow-sm"></div>
                    
                    <div class="bg-white border border-outline-variant rounded-lg p-3 shadow-sm">
                        <div class="flex justify-between items-start mb-1">
                            <span class="text-[10px] font-bold uppercase {avance.tipo === 'Audiencia' ? 'text-error' : 'text-primary'}">{avance.tipo}</span>
                            <span class="text-[10px] text-outline">
                                {new Date(avance.fecha).toLocaleDateString('es-MX', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}
                            </span>
                        </div>
                        <p class="text-body-md text-on-surface whitespace-pre-wrap">{avance.descripcion}</p>
                    </div>
                </div>
            {/each}
            
            <!-- Created dot -->
            <div class="relative pl-6">
                <div class="absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full bg-outline border-2 border-white"></div>
                <div class="text-[11px] text-outline">Caso Iniciado</div>
            </div>
        </div>

        <!-- Add Avance -->
        <div class="bg-white border border-outline-variant rounded-xl p-md shadow-sm mt-4">
            <h4 class="font-bold text-label-sm text-on-surface uppercase mb-md">Registrar Avance</h4>
            <form onsubmit={handleAddAvance} class="space-y-sm">
                <select bind:value={formAvanceTipo} class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1 text-label-sm outline-none">
                    <option value="Nota">Nota / Avance Simple</option>
                    <option value="Audiencia">Programar Audiencia / Cita</option>
                    <option value="Documento">Recepción de Documento</option>
                </select>
                
                {#if formAvanceTipo === 'Audiencia'}
                    <input type="datetime-local" bind:value={formAvanceFechaProgramada} class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1 text-label-sm outline-none focus:border-primary" required>
                    <p class="text-[10px] text-secondary flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">info</span> Se agendará automáticamente en el Calendario</p>
                {/if}
                
                <textarea bind:value={formAvanceDesc} rows="2" placeholder="Detalle del avance..." class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary" required></textarea>
                
                <button type="submit" disabled={isSubmittingAvance} class="w-full bg-secondary-container text-on-secondary-container py-1 rounded-lg font-bold text-label-sm hover:opacity-90 transition-opacity">
                    {#if isSubmittingAvance} Guardando... {:else} Guardar Registro {/if}
                </button>
            </form>
        </div>
    </div>
</div>
{/if}

<style>
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    .animation-slide-in {
        animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .animation-scale {
        animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes slideInRight {
        from { opacity: 0; transform: translateX(100%); }
        to { opacity: 1; transform: translateX(0); }
    }
    @keyframes scaleIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
</style>
