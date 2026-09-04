<script>
    import { onMount, onDestroy } from 'svelte';
    import { subscribeToCasos, addCaso, updateCaso, registrarAvance, deleteCaso, archivarCaso } from '$lib/firebase/casos.js';
    import { subscribeToClientes } from '$lib/firebase/clientes.js';
    import { subscribeToEmpleados } from '$lib/firebase/empleados.js';
    import { subscribeToCasosSettings, updateCasosSettings } from '$lib/firebase/settings.js';
    import { authStore } from '$lib/stores/auth.js';
    
    // Store Subscriptions
    let casos = $state([]);
    let clientes = $state([]);
    let empleados = $state([]);
    let loading = $state(true);
    let unsubC = null;
    let unsubCli = null;
    let unsubEmp = null;
    let unsubSettings = null;

    // Computed Roles
    let currentEmpleado = $derived(empleados.find(e => e.authUid === $authStore.user?.uid));
    let isAdministrador = $derived($authStore.profile?.nivelAcceso === 'admin' || $authStore.profile?.role === 'admin' || (!currentEmpleado || currentEmpleado.rol === 'Administrador'));

    // Computed
    let columnas = $state(['Pendiente Docs', 'En Proceso', 'Adentro', 'Finalizado']);
    
    // Edit Columnas Modal
    let isEditColumnasModalOpen = $state(false);
    let editableColumnas = $state([]);
    let isSavingColumnas = $state(false);

    function openEditColumnas() {
        editableColumnas = [...columnas];
        isEditColumnasModalOpen = true;
    }

    function addEditableColumna() {
        editableColumnas = [...editableColumnas, 'Nueva Etapa'];
    }

    function removeEditableColumna(index) {
        editableColumnas = editableColumnas.filter((_, i) => i !== index);
    }

    function moveEditableColumna(index, direction) {
        if (direction === -1 && index > 0) {
            const temp = editableColumnas[index];
            editableColumnas[index] = editableColumnas[index - 1];
            editableColumnas[index - 1] = temp;
        } else if (direction === 1 && index < editableColumnas.length - 1) {
            const temp = editableColumnas[index];
            editableColumnas[index] = editableColumnas[index + 1];
            editableColumnas[index + 1] = temp;
        }
    }

    async function saveColumnas() {
        if (editableColumnas.some(c => !c.trim())) return alert("Las columnas no pueden estar vacías");
        isSavingColumnas = true;
        try {
            await updateCasosSettings({ columnas: editableColumnas });
            isEditColumnasModalOpen = false;
        } catch(e) {
            alert("Error al guardar columnas");
        } finally {
            isSavingColumnas = false;
        }
    }

    // Search & Filter
    let searchQuery = $state('');
    let casosFiltrados = $derived(casos.filter(c => 
        (c.titulo?.toLowerCase().includes(searchQuery.toLowerCase())) || 
        (c.clienteNombre?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.numeroTramite && c.numeroTramite.toLowerCase().includes(searchQuery.toLowerCase()))
    ));

    onMount(() => {
        unsubC = subscribeToCasos(data => { casos = data; loading = false; });
        unsubCli = subscribeToClientes(data => clientes = data);
        unsubEmp = subscribeToEmpleados(data => empleados = data);
        unsubSettings = subscribeToCasosSettings(data => {
            if (data && data.columnas) columnas = data.columnas;
        });
    });

    onDestroy(() => {
        if(unsubC) unsubC();
        if(unsubCli) unsubCli();
        if(unsubEmp) unsubEmp();
        if(unsubSettings) unsubSettings();
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
    let formMontoAcordado = $state('');
    let formAdelanto = $state('');

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
                montoAcordado: parseFloat(formMontoAcordado || 0),
                adelanto: parseFloat(formAdelanto || 0),
                abogadoEncargado: $authStore.user?.uid,
                creadoPor: $authStore.user?.uid,
                estado: columnas[0] // Initialize with the first available column
            });
            isModalOpen = false;
            // Reset
            formTitulo = ''; formDescripcion = ''; formFechaLimite = ''; formClienteId = '';
            formMontoAcordado = ''; formAdelanto = '';
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

    // Acciones Especiales de Caso
    async function handleArchivarCaso(motivo = 'Archivado') {
        if (!selectedCaso) return;
        if (!confirm(`¿Estás seguro que deseas ${motivo.toLowerCase()} este trámite? Desaparecerá de este tablero pero se guardará el registro.`)) return;
        
        try {
            await archivarCaso(selectedCaso.id, motivo);
            isSidePanelOpen = false;
            selectedCaso = null;
        } catch(e) {
            alert("Hubo un error al archivar el caso.");
        }
    }

    async function handleEliminarCasoFisico() {
        if (!selectedCaso) return;
        if (!confirm(`⚠️ PRECAUCIÓN: ¿Estás completamente seguro de ELIMINAR FÍSICAMENTE este trámite? Se borrará de la base de datos de forma permanente.`)) return;
        
        try {
            await deleteCaso(selectedCaso.id);
            isSidePanelOpen = false;
            selectedCaso = null;
        } catch(e) {
            alert("Hubo un error al eliminar el caso.");
        }
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
                    asignadoA: selectedCaso.abogadoEncargado,
                    clienteId: selectedCaso.clienteId
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
            {#if isAdministrador}
                <button onclick={openEditColumnas} class="bg-surface-container text-on-surface-variant py-sm px-md rounded-xl font-bold flex items-center gap-2 hover:bg-surface-container-high transition-all shadow-sm">
                    <span class="material-symbols-outlined text-[18px]">view_column</span>
                </button>
            {/if}
            <button onclick={() => isModalOpen = true} class="bg-primary text-on-primary py-sm px-md rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all whitespace-nowrap shadow-sm shadow-primary/20">
                <span class="material-symbols-outlined text-[18px]">add</span>
                Crear Trámite
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
                        {@const overdue = caso.estado !== columnas[columnas.length - 1] && isOverdue(caso.fechaLimite)}
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
                            
                            <h4 class="font-bold text-body-lg text-on-surface mb-xs leading-tight line-clamp-2">
                                {#if caso.numeroTramite}
                                    <span class="text-primary text-[12px] font-bold mr-1">#{caso.numeroTramite}</span>
                                {/if}
                                {caso.titulo}
                            </h4>
                            <p class="text-label-sm text-on-surface-variant mb-md flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px]">person</span> {caso.clienteNombre}
                            </p>
                            
                            {#if caso.montoAcordado > 0}
                                <div class="mb-sm flex items-center justify-between text-[11px] font-bold p-1 bg-surface-container rounded">
                                    <span class="text-on-surface-variant">Acordado: ${caso.montoAcordado.toLocaleString('es-MX')}</span>
                                    <span class={caso.saldoPendiente > 0 ? 'text-error' : 'text-primary'}>
                                        Saldo: ${caso.saldoPendiente?.toLocaleString('es-MX') || '0'}
                                    </span>
                                </div>
                            {/if}
                            
                            <div class="flex justify-between items-center border-t border-outline-variant/30 pt-sm mt-auto">
                                <div class="flex -space-x-2">
                                    <div class="w-6 h-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-[10px] font-bold border border-white overflow-hidden" title={emp?.nombre || 'Abogado'}>
                                        {#if emp?.photoURL}
                                            <img src={emp.photoURL} alt={emp.nombre} class="w-full h-full object-cover">
                                        {:else}
                                            {(emp?.nombre || 'U').charAt(0).toUpperCase()}
                                        {/if}
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
{@const empCreador = empleados.find(e => e.authUid === selectedCaso.creadoPor || e.authUid === selectedCaso.abogadoEncargado)}
{@const isUltimaEtapa = selectedCaso.estado === columnas[columnas.length - 1]}
<div class="fixed inset-y-0 right-0 w-full md:w-[450px] bg-white shadow-2xl border-l border-outline-variant z-50 flex flex-col animation-slide-in">
    <!-- Header Panel -->
    <div class="p-lg border-b border-outline-variant bg-surface-container-lowest flex justify-between items-start shrink-0">
        <div>
            <span class="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest mb-xs inline-block">{selectedCaso.tipo}</span>
            {#if selectedCaso.numeroTramite}
                <span class="bg-secondary/10 text-secondary text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest mb-xs inline-block ml-2">#{selectedCaso.numeroTramite}</span>
            {/if}
            <h3 class="font-bold text-headline-md text-on-surface leading-tight mb-2">{selectedCaso.titulo}</h3>
            <p class="text-label-sm text-on-surface-variant flex items-center gap-1">
                <span class="material-symbols-outlined text-[16px]">person</span> {selectedCaso.clienteNombre}
            </p>
            {#if selectedCaso.montoAcordado > 0}
                <div class="flex gap-sm mt-sm">
                    <span class="bg-surface-container-high text-on-surface-variant text-[11px] font-bold px-2 py-1 rounded">
                        Acordado: ${selectedCaso.montoAcordado.toLocaleString('es-MX')}
                    </span>
                    <span class="text-[11px] font-bold px-2 py-1 rounded {selectedCaso.saldoPendiente > 0 ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary-container'}">
                        Saldo: ${selectedCaso.saldoPendiente?.toLocaleString('es-MX') || '0'}
                    </span>
                </div>
            {/if}
        </div>
        <div class="flex items-center gap-2">
            {#if isAdministrador}
            <button onclick={handleEliminarCasoFisico} title="Eliminar Permanentemente" class="p-2 hover:bg-error/10 text-error rounded-full transition-colors shrink-0">
                <span class="material-symbols-outlined">delete_forever</span>
            </button>
            {/if}
            <button onclick={() => isSidePanelOpen = false} class="p-2 hover:bg-surface-container rounded-full text-outline hover:text-on-surface transition-colors shrink-0">
                <span class="material-symbols-outlined">close_fullscreen</span>
            </button>
        </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-lg bg-surface">
        <!-- Change Status -->
        <div class="mb-lg p-md bg-white border border-outline-variant rounded-xl shadow-sm">
            <label class="block text-label-sm font-bold text-outline uppercase mb-2">Estado Actual</label>
            <select 
                value={selectedCaso.estado} 
                onchange={(e) => changeEstado(e.target.value)} 
                class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 font-bold text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all mb-3"
            >
                {#each columnas as col}
                    <option value={col}>{col}</option>
                {/each}
                {#if !columnas.includes(selectedCaso.estado)}
                    <option value={selectedCaso.estado}>{selectedCaso.estado} (Columna Eliminada)</option>
                {/if}
            </select>
            
            {#if isUltimaEtapa}
                <button onclick={() => handleArchivarCaso('Finalizado')} class="w-full bg-[#D4AF37] text-white py-2 rounded-lg font-bold text-label-md flex items-center justify-center gap-2 hover:opacity-90 shadow-sm">
                    <span class="material-symbols-outlined text-[20px]">task_alt</span>
                    Registrar Trámite Finalizado y Archivar
                </button>
            {:else}
                <button onclick={() => handleArchivarCaso('Archivado Manualmente')} class="w-full bg-surface-container-high text-on-surface py-2 rounded-lg font-bold text-label-md flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors">
                    <span class="material-symbols-outlined text-[18px]">archive</span>
                    Archivar Trámite (Retirar de vista)
                </button>
            {/if}
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
                {@const empAvance = empleados.find(e => e.authUid === avance.creadoPor || e.id === avance.creadoPor)}
                <div class="relative pl-6">
                    <!-- Timeline dot -->
                    <div class="absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full {avance.tipo === 'Audiencia' ? 'bg-error' : (avance.tipo === 'Estado' ? 'bg-secondary' : 'bg-primary')} border-2 border-white shadow-sm"></div>
                    
                    <div class="bg-white border border-outline-variant rounded-lg p-3 shadow-sm">
                        <div class="flex justify-between items-start mb-1">
                            <span class="text-[10px] font-bold uppercase {avance.tipo === 'Audiencia' ? 'text-error' : 'text-primary'}">{avance.tipo}</span>
                            <span class="text-[10px] text-outline flex items-center gap-1 text-right">
                                {#if empAvance?.photoURL}
                                    <img src={empAvance.photoURL} alt="P" class="w-4 h-4 rounded-full object-cover">
                                {:else}
                                    <span class="material-symbols-outlined text-[12px]">person</span>
                                {/if}
                                {empAvance ? empAvance.nombre : 'Sistema'} &bull; 
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
                <div class="text-[11px] text-outline flex items-center gap-1">
                    {#if empCreador?.photoURL}
                        <img src={empCreador.photoURL} alt="P" class="w-4 h-4 rounded-full object-cover">
                    {:else}
                        <span class="material-symbols-outlined text-[14px]">person</span>
                    {/if}
                    {empCreador ? empCreador.nombre : 'Sistema'} &bull; Caso Iniciado
                </div>
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

<!-- Modal: Editar Columnas -->
{#if isEditColumnasModalOpen}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-surface rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden animation-scale flex flex-col">
        <div class="p-lg border-b border-outline-variant bg-surface-container-lowest flex justify-between items-center shrink-0">
            <div>
                <h3 class="font-bold text-headline-sm text-on-surface">Editar Etapas (Columnas)</h3>
                <p class="text-label-sm text-on-surface-variant">Configura las columnas del tablero.</p>
            </div>
            <button onclick={() => isEditColumnasModalOpen = false} class="p-2 hover:bg-surface-container rounded-full text-outline transition-colors">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="p-lg overflow-y-auto max-h-[60vh] custom-scrollbar flex flex-col gap-3">
            {#each editableColumnas as col, i}
                <div class="flex items-center gap-2">
                    <div class="flex flex-col bg-surface-container-low rounded-lg">
                        <button onclick={() => moveEditableColumna(i, -1)} disabled={i === 0} class="text-outline hover:text-on-surface disabled:opacity-30 disabled:hover:text-outline p-0.5"><span class="material-symbols-outlined text-[16px]">expand_less</span></button>
                        <button onclick={() => moveEditableColumna(i, 1)} disabled={i === editableColumnas.length - 1} class="text-outline hover:text-on-surface disabled:opacity-30 disabled:hover:text-outline p-0.5"><span class="material-symbols-outlined text-[16px]">expand_more</span></button>
                    </div>
                    <input bind:value={editableColumnas[i]} class="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-md outline-none focus:border-primary" />
                    <button onclick={() => removeEditableColumna(i)} class="p-2 text-error hover:bg-error/10 rounded-full transition-colors"><span class="material-symbols-outlined">delete</span></button>
                </div>
            {/each}
            <button onclick={addEditableColumna} class="mt-2 text-primary font-bold text-label-md flex items-center gap-1 self-start hover:underline">
                <span class="material-symbols-outlined text-[18px]">add</span> Añadir Etapa
            </button>
            <p class="text-[11px] text-outline mt-2">Nota: Eliminar una columna no eliminará los casos que estén en ella, pero dejarán de ser visibles en el tablero hasta que se muevan o se restaure la columna.</p>
        </div>
        <div class="p-lg border-t border-outline-variant bg-surface-container-lowest flex justify-end gap-3 shrink-0">
            <button onclick={() => isEditColumnasModalOpen = false} class="px-6 py-2 rounded-xl font-bold text-label-md text-on-surface-variant hover:bg-surface-container transition-colors">
                Cancelar
            </button>
            <button onclick={saveColumnas} disabled={isSavingColumnas} class="px-6 py-2 rounded-xl font-bold text-label-md bg-primary text-on-primary hover:opacity-90 transition-opacity flex items-center gap-2">
                {#if isSavingColumnas}
                    <span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Guardando...
                {:else}
                    Guardar Cambios
                {/if}
            </button>
        </div>
    </div>
</div>
{/if}

<!-- Modal: Nuevo Caso -->
{#if isModalOpen}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-surface rounded-2xl w-full max-w-[500px] shadow-2xl overflow-hidden animation-scale flex flex-col max-h-[90vh]">
        <div class="p-lg border-b border-outline-variant bg-surface-container-lowest flex justify-between items-center shrink-0">
            <div>
                <h3 class="font-bold text-headline-sm text-on-surface">Nuevo Trámite/Proceso</h3>
                <p class="text-label-sm text-on-surface-variant">Inicia un nuevo caso en el sistema.</p>
            </div>
            <button onclick={() => isModalOpen = false} class="p-2 hover:bg-surface-container rounded-full text-outline transition-colors">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        
        <div class="p-lg overflow-y-auto custom-scrollbar">
            <form id="nuevoCasoForm" onsubmit={handleAddCaso} class="space-y-md">
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Cliente *</label>
                    <select bind:value={formClienteId} class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" required>
                        <option value="" disabled selected>Selecciona un cliente...</option>
                        {#each clientes as cli}
                            <option value={cli.id}>{cli.nombreCompleto} ({cli.rfc_dni || 'Sin DNI'})</option>
                        {/each}
                    </select>
                </div>
                
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Título del Trámite/Proceso *</label>
                    <input type="text" bind:value={formTitulo} placeholder="Ej: Divorcio por mutuo acuerdo" class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" required />
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Materia/Tipo</label>
                        <select bind:value={formTipo} class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all">
                            <option value="Civil">Civil</option>
                            <option value="Familiar">Familiar</option>
                            <option value="Penal">Penal</option>
                            <option value="Inmobiliario">Inmobiliario</option>
                            <option value="Laboral">Laboral</option>
                            <option value="Otro">Otro</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1">Fecha Límite</label>
                        <input type="date" bind:value={formFechaLimite} class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[16px] text-secondary">payments</span> Monto Acordado ($)
                        </label>
                        <input type="number" step="0.01" bind:value={formMontoAcordado} placeholder="0.00" class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                    </div>
                    <div>
                        <label class="block text-label-md font-bold text-on-surface mb-1 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[16px] text-primary">account_balance_wallet</span> Adelanto Inicial ($)
                        </label>
                        <input type="number" step="0.01" bind:value={formAdelanto} placeholder="0.00" class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                    </div>
                </div>
                
                <div>
                    <label class="block text-label-md font-bold text-on-surface mb-1">Descripción inicial (Opcional)</label>
                    <textarea bind:value={formDescripcion} rows="3" placeholder="Detalles o anotaciones iniciales del caso..." class="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"></textarea>
                </div>
            </form>
        </div>
        
        <div class="p-lg border-t border-outline-variant bg-surface-container-lowest flex justify-end gap-3 shrink-0">
            <button onclick={() => isModalOpen = false} class="px-6 py-2 rounded-xl font-bold text-label-md text-on-surface-variant hover:bg-surface-container transition-colors">
                Cancelar
            </button>
            <button type="submit" form="nuevoCasoForm" disabled={isSubmitting} class="px-6 py-2 rounded-xl font-bold text-label-md bg-primary text-on-primary hover:opacity-90 transition-opacity shadow-sm flex items-center gap-2">
                {#if isSubmitting}
                    <span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Guardando...
                {:else}
                    Crear Trámite
                {/if}
            </button>
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
