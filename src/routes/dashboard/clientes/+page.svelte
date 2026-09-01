<script>
    import { onMount, onDestroy } from 'svelte';
    import { subscribeToClientes, addCliente, archivarCliente, registrarVisita } from '$lib/firebase/clientes.js';
    import { modoCelular } from '$lib/stores/ui.js';

    let clientes = $state([]);
    let unsubscribe = null;
    let loading = $state(true);
    let searchQuery = $state('');

    // Modal state
    let showModal = $state(false);
    let modalType = $state('digital'); // 'digital' or 'recepcion'
    let recepcionTab = $state('nuevo'); // 'nuevo' or 'existente'
    let recepcionSearch = $state('');
    let isSubmitting = $state(false);
    let formError = $state('');
    let successMessage = $state('');

    // Form data
    let formData = $state({
        nombreCompleto: '',
        telefono: '',
        rfc_dni: ''
    });

    onMount(() => {
        // Subscribe to real-time updates from Firestore
        unsubscribe = subscribeToClientes((data) => {
            clientes = data;
            loading = false;
        });
    });

    onDestroy(() => {
        if (unsubscribe) unsubscribe();
    });

    // Filtro principal de la tabla
    let clientesFiltrados = $derived(
        clientes.filter(c => c.estado === 'Activo' && 
            (c.nombreCompleto.toLowerCase().includes(searchQuery.toLowerCase()) || 
             c.telefono.includes(searchQuery)))
    );

    // Filtro para el modal de recepción
    let clientesRecepcionFiltrados = $derived(
        clientes.filter(c => c.estado === 'Activo' && 
            (c.nombreCompleto.toLowerCase().includes(recepcionSearch.toLowerCase()) || 
             c.telefono.includes(recepcionSearch)))
    );

    function openModal(type) {
        modalType = type;
        recepcionTab = 'existente'; // Por defecto buscar uno existente si es recepción
        recepcionSearch = '';
        formData = { nombreCompleto: '', telefono: '', rfc_dni: '' };
        formError = '';
        successMessage = '';
        showModal = true;
    }

    function closeModal() {
        showModal = false;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        isSubmitting = true;
        formError = '';
        successMessage = '';

        try {
            await addCliente({
                ...formData,
                origen: modalType
            });
            successMessage = '¡Cliente registrado con éxito!';
            setTimeout(closeModal, 1500);
        } catch (error) {
            formError = 'Error al registrar el cliente. Intenta de nuevo.';
            console.error(error);
        } finally {
            isSubmitting = false;
        }
    }

    async function handleRegistrarVisita(cliente) {
        isSubmitting = true;
        formError = '';
        try {
            await registrarVisita(cliente.id, cliente.visitasTotales);
            successMessage = `¡Visita de ${cliente.nombreCompleto} registrada!`;
            setTimeout(closeModal, 1500);
        } catch(error) {
            formError = 'Error al registrar la visita.';
        } finally {
            isSubmitting = false;
        }
    }

    async function handleArchivar(id) {
        if (confirm('¿Estás seguro de archivar este cliente?')) {
            await archivarCliente(id);
        }
    }

    // Format date helper
    function formatDate(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return new Intl.DateTimeFormat('es-MX', { 
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit'
        }).format(date);
    }

    function formatWhatsApp(phone) {
        if (!phone) return '';
        const cleanPhone = phone.replace(/\D/g, '');
        // Asumimos código de país 52 (México) si no tiene suficientes dígitos, pero lo ideal es que lo guarde con código
        return cleanPhone.length <= 10 ? `52${cleanPhone}` : cleanPhone;
    }
</script>

<div class="p-lg space-y-lg max-w-[1440px] mx-auto w-full">
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-md mb-xl">
        <div>
            <h2 class="font-headline-xl text-headline-xl text-on-surface">Directorio de Clientes</h2>
            <p class="font-body-md text-body-md text-on-surface-variant mt-xs">Gestiona tu cartera de clientes y monitorea las visitas en recepción.</p>
        </div>
        <div class="flex flex-col sm:flex-row gap-sm w-full md:w-auto">
            <button onclick={() => $modoCelular = !$modoCelular} class="w-full sm:w-auto bg-surface-container-high border border-outline-variant py-sm px-md rounded-lg font-bold flex items-center justify-center gap-xs hover:bg-surface-variant transition-colors">
                <span class="material-symbols-outlined">{$modoCelular ? 'desktop_windows' : 'smartphone'}</span>
                {$modoCelular ? 'Salir Modo Celular' : 'Modo Celular (Recepción)'}
            </button>
            {#if !$modoCelular}
                <button onclick={() => openModal('recepcion')} class="w-full sm:w-auto flex items-center justify-center gap-xs px-md py-sm bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 rounded-lg font-bold text-label-md transition-all shadow-sm">
                    <span class="material-symbols-outlined text-[18px]">desk</span> 
                    Registro Recepción
                </button>
                <button onclick={() => openModal('digital')} class="w-full sm:w-auto flex items-center justify-center gap-xs px-md py-sm bg-primary text-on-primary hover:bg-primary/90 rounded-lg font-bold text-label-md transition-all shadow-sm">
                    <span class="material-symbols-outlined text-[18px]">add</span> 
                    Nuevo Cliente
                </button>
            {/if}
        </div>
    </div>

    {#if !$modoCelular}
    <!-- Data Table -->
    <div class="glass-card rounded-2xl overflow-hidden shadow-sm">
        <div class="px-lg py-md bg-white flex justify-between items-center border-b border-outline-variant">
            <h3 class="font-headline-md text-headline-md text-on-surface">Todos los Clientes ({clientesFiltrados.length})</h3>
            <div class="flex items-center bg-surface-container-low px-sm py-xs rounded-lg border border-outline-variant">
                <span class="material-symbols-outlined text-on-surface-variant text-[18px] mr-xs">search</span>
                <input type="text" bind:value={searchQuery} placeholder="Buscar por nombre o teléfono..." class="bg-transparent border-none focus:ring-0 text-body-md text-on-surface w-[250px] outline-none">
            </div>
        </div>

        <div class="overflow-x-auto min-h-[400px]">
            {#if loading}
                <div class="flex justify-center items-center h-[300px]">
                    <span class="material-symbols-outlined animate-spin text-primary text-[40px]">progress_activity</span>
                </div>
            {:else if clientesFiltrados.length === 0}
                <div class="flex flex-col justify-center items-center h-[300px] text-on-surface-variant opacity-60">
                    <span class="material-symbols-outlined text-[64px] mb-md">group_off</span>
                    <p class="font-headline-md">No hay clientes registrados</p>
                    <p class="text-body-md">Usa los botones superiores para registrar el primero.</p>
                </div>
            {:else}
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-surface-container-low">
                            <th class="px-lg py-md text-label-sm font-label-sm text-on-surface-variant uppercase">Nombre Completo</th>
                            <th class="px-lg py-md text-label-sm font-label-sm text-on-surface-variant uppercase">Teléfono</th>
                            <th class="px-lg py-md text-label-sm font-label-sm text-on-surface-variant uppercase text-center">Origen</th>
                            <th class="px-lg py-md text-label-sm font-label-sm text-on-surface-variant uppercase">Última Visita</th>
                            <th class="px-lg py-md text-label-sm font-label-sm text-on-surface-variant uppercase">Estado de Trámite</th>
                            <th class="px-lg py-md text-label-sm font-label-sm text-on-surface-variant uppercase text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-outline-variant">
                        {#each clientesFiltrados as cliente (cliente.id)}
                            <tr class="hover:bg-primary-container/5 transition-colors group">
                                <td class="px-lg py-md">
                                    <div class="flex items-center gap-sm">
                                        <div class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold relative">
                                            {cliente.nombreCompleto.charAt(0).toUpperCase()}
                                            {#if cliente.visitasTotales > 3}
                                                <span class="absolute -top-1 -right-1 text-[10px] bg-secondary text-on-secondary rounded-full w-4 h-4 flex items-center justify-center font-bold shadow-sm" title="Cliente Frecuente">⭐</span>
                                            {/if}
                                        </div>
                                        <div>
                                            <span class="font-bold text-on-surface text-body-md block">{cliente.nombreCompleto}</span>
                                            <span class="text-label-sm text-on-surface-variant flex items-center gap-1">
                                                {cliente.rfc_dni || 'Sin DNI'} 
                                                {#if cliente.visitasTotales} • {cliente.visitasTotales} visitas {/if}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-lg py-md font-body-md text-on-surface-variant">{cliente.telefono}</td>
                                <td class="px-lg py-md text-center">
                                    {#if cliente.origen === 'recepcion'}
                                        <span class="px-sm py-[2px] rounded bg-secondary-container/40 text-on-secondary-container text-label-sm font-bold flex items-center justify-center gap-xs w-max mx-auto">
                                            <span class="material-symbols-outlined text-[14px]">sensor_door</span> Físico
                                        </span>
                                    {:else}
                                        <span class="px-sm py-[2px] rounded bg-surface-container-high text-on-surface text-label-sm font-bold flex items-center justify-center gap-xs w-max mx-auto">
                                            <span class="material-symbols-outlined text-[14px]">language</span> Digital
                                        </span>
                                    {/if}
                                </td>
                                <td class="px-lg py-md font-body-md text-on-surface-variant">
                                    <div class="flex items-center gap-xs">
                                        <span class="material-symbols-outlined text-[16px] text-on-surface-variant/60">calendar_clock</span>
                                        {formatDate(cliente.ultimaVisita || cliente.fechaRegistro)}
                                    </div>
                                </td>
                                <td class="px-lg py-md">
                                    {#if cliente.tramiteActual}
                                        <span class="px-sm py-[2px] rounded bg-primary/10 text-primary text-label-sm font-bold border border-primary/20">
                                            {cliente.tramiteActual}
                                        </span>
                                    {:else}
                                        <span class="text-label-sm text-on-surface-variant italic">
                                            Sin trámite en proceso
                                        </span>
                                    {/if}
                                </td>
                                <td class="px-lg py-md text-right flex justify-end gap-xs">
                                    <a href="https://wa.me/{formatWhatsApp(cliente.telefono)}" target="_blank" class="p-xs text-[#25D366] opacity-100 hover:bg-[#25D366]/10 rounded-lg flex items-center justify-center transition-colors" title="Contactar por WhatsApp">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                                          <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c-.003 1.396.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c.003-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
                                        </svg>
                                    </a>
                                    <button class="p-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10 rounded-lg" title="Ver / Editar Cliente">
                                        <span class="material-symbols-outlined text-[20px]">visibility</span>
                                    </button>
                                    <button onclick={() => handleArchivar(cliente.id)} class="p-xs text-error opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error/10 rounded-lg" title="Archivar Cliente">
                                        <span class="material-symbols-outlined text-[20px]">archive</span>
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </div>
    </div>
    {/if}

    {#if $modoCelular}
    <!-- Vista Mobile Nativa (Sin modal) -->
    <div class="bg-surface rounded-2xl w-full max-w-[700px] mx-auto shadow-md overflow-hidden border border-outline-variant">
        <!-- Tabs de Recepción -->
        <div class="flex border-b border-outline-variant shrink-0 bg-surface-container-lowest">
            <button onclick={() => {recepcionTab = 'existente'; modalType = 'recepcion';}} class="flex-1 py-md font-bold text-label-md transition-colors border-b-2 {recepcionTab === 'existente' ? 'border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}">
                Visita (Existente)
            </button>
            <button onclick={() => {recepcionTab = 'nuevo'; modalType = 'digital';}} class="flex-1 py-md font-bold text-label-md transition-colors border-b-2 {recepcionTab === 'nuevo' ? 'border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}">
                Nuevo Cliente
            </button>
        </div>

        <div class="p-md md:p-lg w-full">
            {#if successMessage}
                <div class="bg-primary-container text-on-primary-container p-lg rounded-xl flex flex-col items-center justify-center text-center animation-scale">
                    <span class="material-symbols-outlined text-[48px] mb-sm">check_circle</span>
                    <h4 class="font-bold text-headline-md">{successMessage}</h4>
                </div>
            {:else if recepcionTab === 'existente'}
                <!-- Búsqueda de cliente existente -->
                <div class="space-y-md">
                    <div class="relative">
                        <span class="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                        <input type="text" bind:value={recepcionSearch} placeholder="Buscar por nombre o teléfono..." class="w-full pl-12 bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-lg focus:ring-2 focus:ring-secondary/20 outline-none">
                    </div>

                    {#if recepcionSearch.length > 0}
                        <div class="border border-outline-variant rounded-xl divide-y divide-outline-variant max-h-[300px] overflow-y-auto bg-surface-container-lowest">
                            {#each clientesRecepcionFiltrados as cliente}
                                <div class="p-md flex justify-between items-center hover:bg-secondary/5 transition-colors">
                                    <div>
                                        <p class="font-bold text-body-md text-on-surface">{cliente.nombreCompleto}</p>
                                        <p class="text-label-sm text-on-surface-variant">{cliente.telefono} • Última visita: {formatDate(cliente.ultimaVisita)}</p>
                                    </div>
                                    <button onclick={() => handleRegistrarVisita(cliente)} disabled={isSubmitting} class="px-md py-xs bg-secondary text-on-secondary rounded-lg font-bold text-label-sm hover:opacity-90 disabled:opacity-50">
                                        Registrar Visita
                                    </button>
                                </div>
                            {:else}
                                <div class="p-md text-center text-on-surface-variant">
                                    No se encontraron resultados para "{recepcionSearch}".
                                    <button onclick={() => {recepcionTab = 'nuevo'; modalType = 'digital';}} class="block mx-auto mt-sm text-secondary font-bold hover:underline">Registrar como nuevo</button>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <div class="text-center py-xl text-on-surface-variant flex flex-col items-center">
                            <span class="material-symbols-outlined text-[48px] mb-xs opacity-50">person_search</span>
                            <p>Busca al cliente para registrar su visita física.</p>
                        </div>
                    {/if}
                </div>
            {:else}
                <!-- Formulario de Nuevo Cliente -->
                <form onsubmit={handleSubmit} class="space-y-md">
                    {#if formError}
                        <div class="bg-error-container text-on-error-container p-sm rounded-lg text-label-sm font-bold flex items-center gap-xs">
                            <span class="material-symbols-outlined text-[16px]">error</span> {formError}
                        </div>
                    {/if}

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
                        <div class="space-y-xs md:col-span-2">
                            <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Nombre Completo *</label>
                            <input type="text" bind:value={formData.nombreCompleto} required placeholder="Ej. Juan Pérez" class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                        </div>

                        <div class="space-y-xs">
                            <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Teléfono Móvil *</label>
                            <input type="tel" bind:value={formData.telefono} required placeholder="Ej. 555 123 4567" class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                        </div>

                        <div class="space-y-xs">
                            <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Identificación (RFC / DNI)</label>
                            <input type="text" bind:value={formData.rfc_dni} placeholder="Opcional" class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                        </div>
                    </div>

                    <div class="pt-md flex justify-end gap-sm">
                        <button type="submit" disabled={isSubmitting} class="w-full py-md rounded-xl font-bold bg-primary text-on-primary shadow-md hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-xs text-body-lg">
                            {#if isSubmitting}
                                <span class="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
                            {:else}
                                <span class="material-symbols-outlined text-[24px]">save</span>
                            {/if}
                            Registrar Cliente
                        </button>
                    </div>
                </form>
            {/if}
        </div>
    </div>
    {/if}
</div>

<!-- Modal de Registro -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-on-background/40 backdrop-blur-sm p-4">
        <div class="bg-surface rounded-2xl w-[95vw] max-w-[700px] shadow-2xl overflow-hidden border border-outline-variant animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div class="px-lg py-md {modalType === 'recepcion' ? 'bg-secondary-container text-on-secondary-container' : 'bg-primary-container text-on-primary-container'} flex justify-between items-center shrink-0">
                <div class="flex items-center gap-sm">
                    <span class="material-symbols-outlined">{modalType === 'recepcion' ? 'desk' : 'person_add'}</span>
                    <h3 class="font-headline-md font-bold">
                        {modalType === 'recepcion' ? 'Registro en Recepción' : 'Nuevo Cliente'}
                    </h3>
                </div>
                <button onclick={closeModal} class="hover:bg-black/10 p-xs rounded-full transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <!-- Tabs de Recepción -->
            {#if modalType === 'recepcion'}
                <div class="flex border-b border-outline-variant shrink-0 bg-surface-container-lowest">
                    <button onclick={() => recepcionTab = 'existente'} class="flex-1 py-md font-bold text-label-md transition-colors border-b-2 {recepcionTab === 'existente' ? 'border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}">
                        Cliente Existente
                    </button>
                    <button onclick={() => recepcionTab = 'nuevo'} class="flex-1 py-md font-bold text-label-md transition-colors border-b-2 {recepcionTab === 'nuevo' ? 'border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}">
                        Registrar Nuevo
                    </button>
                </div>
            {/if}

            <div class="p-lg overflow-y-auto">
                {#if successMessage}
                    <div class="bg-primary-container text-on-primary-container p-lg rounded-xl flex flex-col items-center justify-center text-center animation-scale">
                        <span class="material-symbols-outlined text-[48px] mb-sm">check_circle</span>
                        <h4 class="font-bold text-headline-md">{successMessage}</h4>
                    </div>
                {:else if modalType === 'recepcion' && recepcionTab === 'existente'}
                    <!-- Búsqueda de cliente existente -->
                    <div class="space-y-md">
                        <div class="relative">
                            <span class="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                            <input type="text" bind:value={recepcionSearch} placeholder="Buscar por nombre o teléfono..." class="w-full pl-12 bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-lg focus:ring-2 focus:ring-secondary/20 outline-none">
                        </div>

                        {#if recepcionSearch.length > 0}
                            <div class="border border-outline-variant rounded-xl divide-y divide-outline-variant max-h-[300px] overflow-y-auto bg-surface-container-lowest">
                                {#each clientesRecepcionFiltrados as cliente}
                                    <div class="p-md flex justify-between items-center hover:bg-secondary/5 transition-colors">
                                        <div>
                                            <p class="font-bold text-body-md text-on-surface">{cliente.nombreCompleto}</p>
                                            <p class="text-label-sm text-on-surface-variant">{cliente.telefono} • Última visita: {formatDate(cliente.ultimaVisita)}</p>
                                        </div>
                                        <button onclick={() => handleRegistrarVisita(cliente)} disabled={isSubmitting} class="px-md py-xs bg-secondary text-on-secondary rounded-lg font-bold text-label-sm hover:opacity-90 disabled:opacity-50">
                                            Registrar Visita
                                        </button>
                                    </div>
                                {:else}
                                    <div class="p-md text-center text-on-surface-variant">
                                        No se encontraron resultados para "{recepcionSearch}".
                                        <button onclick={() => recepcionTab = 'nuevo'} class="block mx-auto mt-sm text-secondary font-bold hover:underline">Registrar como nuevo</button>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div class="text-center py-xl text-on-surface-variant flex flex-col items-center">
                                <span class="material-symbols-outlined text-[48px] mb-xs opacity-50">person_search</span>
                                <p>Busca al cliente para registrar su visita física.</p>
                            </div>
                        {/if}
                    </div>
                {:else}
                    <!-- Formulario de Nuevo Cliente -->
                    <form onsubmit={handleSubmit} class="space-y-md">
                        {#if formError}
                            <div class="bg-error-container text-on-error-container p-sm rounded-lg text-label-sm font-bold flex items-center gap-xs">
                                <span class="material-symbols-outlined text-[16px]">error</span> {formError}
                            </div>
                        {/if}

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
                            <div class="space-y-xs md:col-span-2">
                                <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Nombre Completo *</label>
                                <input type="text" bind:value={formData.nombreCompleto} required placeholder="Ej. Juan Pérez" class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                            </div>

                            <div class="space-y-xs">
                                <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Teléfono Móvil *</label>
                                <input type="tel" bind:value={formData.telefono} required placeholder="Ej. 555 123 4567" class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                            </div>

                            <div class="space-y-xs">
                                <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Identificación (RFC / DNI)</label>
                                <input type="text" bind:value={formData.rfc_dni} placeholder="Opcional" class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                            </div>
                        </div>

                        <div class="pt-md flex justify-end gap-sm">
                            <button type="button" onclick={closeModal} class="px-md py-sm rounded-lg font-bold text-on-surface-variant hover:bg-surface-container transition-all">
                                Cancelar
                            </button>
                            <button type="submit" disabled={isSubmitting} class="px-md py-sm rounded-lg font-bold {modalType === 'recepcion' ? 'bg-secondary text-on-secondary' : 'bg-primary text-on-primary'} shadow-md hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-xs">
                                {#if isSubmitting}
                                    <span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                                {:else}
                                    <span class="material-symbols-outlined text-[18px]">save</span>
                                {/if}
                                Registrar Cliente
                            </button>
                        </div>
                    </form>
                {/if}
            </div>
        </div>
    </div>
{/if}
