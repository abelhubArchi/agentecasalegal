<script>
    import { onMount, onDestroy } from 'svelte';
    import { subscribeToDocumentos, uploadDocumento, updateDocumento, deleteDocumento } from '$lib/firebase/documentos.js';
    import { subscribeToEmpleados } from '$lib/firebase/empleados.js';
    import { authStore } from '$lib/stores/auth.js';
    import { modoCelular } from '$lib/stores/ui.js';
    
    let documentos = $state([]);
    let empleados = $state([]);
    let loading = $state(true);
    let unsubscribeD = null;
    let unsubscribeE = null;
    
    // Auth & Permissions
    let currentEmpleado = $derived(empleados.find(e => e.authUid === $authStore.user?.uid));
    let isAdministrador = $derived(!currentEmpleado || currentEmpleado.rol === 'Administrador');

    let documentosPermitidos = $derived(documentos.filter(d => {
        if (isAdministrador) return true;
        if (d.creadoPor === $authStore.user?.uid) return true;
        if (d.permisoVisualizacion === 'Publico') return true;
        if (d.permisoVisualizacion === 'Compartido' && d.compartidoCon?.includes($authStore.user?.uid)) return true;
        return false;
    }));

    // Search and Filter
    let searchQuery = $state('');
    let selectedTag = $state('Todo');

    let allTags = $derived(['Todo', ...new Set(documentosPermitidos.flatMap(d => d.etiquetas || []))]);

    let documentosFiltrados = $derived(documentosPermitidos.filter(d => {
        const matchName = d.nombreOriginal?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchTag = selectedTag === 'Todo' || (d.etiquetas && d.etiquetas.includes(selectedTag));
        return matchName && matchTag;
    }));

    // Stats
    let totalDocs = $derived(documentosPermitidos.length);
    let totalBytes = $derived(documentosPermitidos.reduce((acc, d) => acc + (d.tamanoBytes || 0), 0));
    
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    onMount(() => {
        unsubscribeD = subscribeToDocumentos(data => {
            documentos = data;
            loading = false;
        });
        unsubscribeE = subscribeToEmpleados(data => {
            empleados = data;
        });
    });
    
    onDestroy(() => {
        if(unsubscribeD) unsubscribeD();
        if(unsubscribeE) unsubscribeE();
    });

    // Upload Logic
    let isDragging = $state(false);
    let isUploading = $state(false);
    let fileInputRef = $state(null);
    let isUploadModalOpen = $state(false);
    let pendingFiles = $state([]);

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        
        // Add to pending files with default metadata
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            let autoTags = [];
            if (file.name.includes('Contrato') || file.name.includes('contrato')) autoTags.push('Contrato');
            if (file.type.includes('pdf')) autoTags.push('PDF');
            if (file.type.includes('image')) autoTags.push('Imagen');
            if (file.type.includes('word') || file.name.endsWith('.docx')) autoTags.push('Word');
            
            pendingFiles.push({
                file: file,
                nombrePersonalizado: file.name,
                permisoVisualizacion: 'Publico',
                compartidoCon: [],
                etiquetas: autoTags
            });
        }
        isUploadModalOpen = true;
        if(fileInputRef) fileInputRef.value = '';
    }

    async function confirmUpload() {
        isUploading = true;
        try {
            for (const item of pendingFiles) {
                // If they changed the name but didn't keep the extension, keep original extension
                let finalName = item.nombrePersonalizado;
                const ext = item.file.name.split('.').pop();
                if (!finalName.endsWith('.' + ext)) {
                    finalName = finalName + '.' + ext;
                }

                // Override file name using a new File object if name changed
                const fileToUpload = new File([item.file], finalName, { type: item.file.type });

                await uploadDocumento(fileToUpload, {
                    creadoPor: $authStore.user?.uid,
                    permisoVisualizacion: item.permisoVisualizacion,
                    compartidoCon: item.compartidoCon,
                    etiquetas: item.etiquetas
                });
            }
            alert("Documentos subidos exitosamente");
            isUploadModalOpen = false;
            pendingFiles = [];
        } catch (error) {
            console.error(error);
            alert("Error al subir los documentos");
        } finally {
            isUploading = false;
        }
    }

    function cancelUpload() {
        isUploadModalOpen = false;
        pendingFiles = [];
    }

    // Drag events
    function onDragOver(e) { e.preventDefault(); isDragging = true; }
    function onDragLeave(e) { e.preventDefault(); isDragging = false; }
    function onDrop(e) {
        e.preventDefault();
        isDragging = false;
        if (e.dataTransfer.files) {
            handleFiles(e.dataTransfer.files);
        }
    }

    // Side Panel (Preview)
    let selectedDoc = $state(null);
    let isPreviewOpen = $state(false);

    function openPreview(doc) {
        selectedDoc = doc;
        isPreviewOpen = true;
    }

    function closePreview() {
        isPreviewOpen = false;
        selectedDoc = null;
    }

    function printDoc(url) {
        // Create an iframe to print
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
            iframe.contentWindow.print();
            setTimeout(() => { document.body.removeChild(iframe); }, 1000);
        };
    }

    // Download Helper (Force download using fetch to bypass browser PDF viewer)
    async function forceDownload(url, filename) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Error downloading file:', error);
            window.open(url, '_blank'); // Fallback
        }
    }

    // Helper for Icons
    function getFileIcon(type, filename) {
        if (type.includes('pdf') || filename.endsWith('.pdf')) return { icon: 'picture_as_pdf', color: 'text-error', bg: 'bg-error/10' };
        if (type.includes('image') || filename.match(/\.(jpg|jpeg|png|gif)$/i)) return { icon: 'image', color: 'text-secondary', bg: 'bg-secondary/10' };
        if (type.includes('word') || filename.endsWith('.docx')) return { icon: 'description', color: 'text-[#185abd]', bg: 'bg-[#185abd]/10' };
        if (type.includes('excel') || filename.endsWith('.xlsx')) return { icon: 'table_chart', color: 'text-[#107c41]', bg: 'bg-[#107c41]/10' };
        return { icon: 'draft', color: 'text-on-surface-variant', bg: 'bg-surface-container-high' };
    }
</script>

<div class="p-4 md:p-lg max-w-[1440px] mx-auto w-full pb-24 md:pb-lg h-full flex flex-col relative">
    
    <!-- Top Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-end mb-xl gap-4">
        <div>
            <h2 class="font-headline-xl text-headline-xl text-on-surface tracking-tight flex items-center gap-2">
                <span class="material-symbols-outlined text-[32px] text-primary" style="font-variation-settings: 'FILL' 1;">security</span>
                Bóveda Global
            </h2>
            <p class="text-body-md text-on-surface-variant">Inteligencia documental centralizada para la firma legal.</p>
        </div>
        <div class="relative w-full md:w-[400px]">
            <span class="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">search</span>
            <input bind:value={searchQuery} class="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-[48px] pr-md py-sm font-body-md text-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none" placeholder="Buscar documento por nombre..." type="text">
        </div>
    </div>

    <!-- KPIs -->
    {#if !$modoCelular}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md md:gap-lg mb-xl">
        <div class="glass-card p-md md:p-lg rounded-2xl flex items-center justify-between hover:border-primary/50 transition-all">
            <div>
                <p class="text-label-sm font-bold text-outline uppercase tracking-wider mb-1">Total Documentos</p>
                <h2 class="text-display-lg text-on-surface leading-none">{totalDocs}</h2>
            </div>
            <div class="bg-primary/10 p-md rounded-xl text-primary"><span class="material-symbols-outlined text-[32px]">folder_copy</span></div>
        </div>
        <div class="glass-card p-md md:p-lg rounded-2xl flex items-center justify-between hover:border-error/50 transition-all">
            <div>
                <p class="text-label-sm font-bold text-outline uppercase tracking-wider mb-1">Riesgos IA</p>
                <h2 class="text-display-lg text-on-surface leading-none">0</h2>
            </div>
            <div class="bg-error/10 p-md rounded-xl text-error"><span class="material-symbols-outlined text-[32px]">psychology</span></div>
        </div>
        <div class="glass-card p-md md:p-lg rounded-2xl flex items-center justify-between hover:border-secondary/50 transition-all">
            <div>
                <p class="text-label-sm font-bold text-outline uppercase tracking-wider mb-1">Espacio Usado</p>
                <h2 class="text-headline-xl text-on-surface leading-none mt-2">{formatBytes(totalBytes)}</h2>
            </div>
            <div class="bg-secondary/10 p-md rounded-xl text-secondary"><span class="material-symbols-outlined text-[32px]">hard_drive</span></div>
        </div>
        <div class="glass-card p-md md:p-lg rounded-2xl flex items-center justify-between hover:border-primary/50 transition-all">
            <div>
                <p class="text-label-sm font-bold text-outline uppercase tracking-wider mb-1">Privacidad</p>
                <h2 class="text-headline-lg text-on-surface leading-none mt-2">Segura</h2>
            </div>
            <div class="bg-primary/10 p-md rounded-xl text-primary"><span class="material-symbols-outlined text-[32px]">shield_lock</span></div>
        </div>
    </div>
    {/if}

    <!-- Main Workspace -->
    <div class="flex-1 grid grid-cols-12 gap-lg min-h-[500px]">
        
        <!-- Left: Explorer & Upload -->
        <div class="col-span-12 {isPreviewOpen && !$modoCelular ? 'lg:col-span-8' : 'lg:col-span-12'} flex flex-col gap-lg transition-all duration-300">
            
            <!-- Upload Area -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div 
                ondragover={onDragOver} 
                ondragleave={onDragLeave} 
                ondrop={onDrop}
                class="border-2 {isDragging ? 'border-primary bg-primary/10' : 'border-dashed border-outline-variant bg-white'} rounded-2xl p-lg text-center transition-all relative overflow-hidden"
            >
                <input type="file" bind:this={fileInputRef} class="hidden" multiple onchange={(e) => handleFiles(e.target.files)}>
                <span class="material-symbols-outlined text-[48px] text-primary mb-sm block">cloud_upload</span>
                <h3 class="font-bold text-headline-md text-on-surface mb-xs">Cargar Nuevos Documentos</h3>
                <p class="text-body-md text-outline mb-md">Arrastra archivos aquí o haz clic para subir</p>
                <button onclick={() => fileInputRef.click()} disabled={isUploading} class="px-xl py-sm bg-primary text-on-primary font-bold rounded-lg shadow-md hover:scale-105 transition-transform disabled:opacity-50">
                    {#if isUploading} Subiendo... {:else} Explorar Archivos {/if}
                </button>
            </div>

            <!-- File Explorer -->
            <div class="bg-white rounded-2xl border border-outline-variant flex flex-col flex-1 shadow-sm overflow-hidden min-h-[300px]">
                <div class="p-md border-b border-outline-variant flex flex-col sm:flex-row justify-between items-start sm:items-center bg-surface-container-lowest gap-sm">
                    <div class="flex items-center gap-sm flex-wrap w-full">
                        <span class="font-bold text-label-md text-on-surface-variant flex items-center">
                            <span class="material-symbols-outlined text-[20px] mr-1">filter_list</span> Filtrar:
                        </span>
                        <div class="flex gap-2 overflow-x-auto pb-1 w-full sm:w-auto hide-scrollbar">
                            {#each allTags as tag}
                                <button onclick={() => selectedTag = tag} class="px-3 py-1 rounded-full text-label-sm font-bold border transition-colors whitespace-nowrap {selectedTag === tag ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:bg-surface-container'}">
                                    {tag}
                                </button>
                            {/each}
                        </div>
                    </div>
                </div>
                
                <div class="overflow-x-auto flex-1">
                    <table class="w-full text-left border-collapse min-w-[600px]">
                        <thead class="bg-surface-container-lowest border-b border-outline-variant">
                            <tr>
                                <th class="px-lg py-md font-bold text-label-sm text-outline uppercase">Nombre de Archivo</th>
                                <th class="px-lg py-md font-bold text-label-sm text-outline uppercase">Etiquetas / IA</th>
                                <th class="px-lg py-md font-bold text-label-sm text-outline uppercase">Subido por</th>
                                <th class="px-lg py-md font-bold text-label-sm text-outline uppercase text-right">Detalles</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-outline-variant/30">
                            {#if loading}
                                <tr><td colspan="4" class="text-center p-xl"><span class="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span></td></tr>
                            {:else if documentosFiltrados.length === 0}
                                <tr><td colspan="4" class="text-center p-xl text-outline">No se encontraron documentos en la bóveda.</td></tr>
                            {:else}
                                {#each documentosFiltrados as doc (doc.id)}
                                    {@const ui = getFileIcon(doc.tipoArchivo, doc.nombreOriginal)}
                                    {@const creador = empleados.find(e => e.authUid === doc.creadoPor)}
                                    <tr onclick={() => openPreview(doc)} class="hover:bg-primary/5 transition-colors cursor-pointer {selectedDoc?.id === doc.id ? 'bg-primary/5 border-l-4 border-primary' : 'border-l-4 border-transparent'}">
                                        <td class="px-lg py-md">
                                            <div class="flex items-center gap-md">
                                                <div class="{ui.bg} p-sm rounded {ui.color} flex items-center justify-center shrink-0">
                                                    <span class="material-symbols-outlined text-[24px]">{ui.icon}</span>
                                                </div>
                                                <div class="min-w-0">
                                                    <p class="font-bold text-label-md text-on-surface truncate">{doc.nombreOriginal}</p>
                                                    <p class="text-[11px] text-outline flex items-center gap-1">
                                                        {formatBytes(doc.tamanoBytes)} 
                                                        {#if doc.permisoVisualizacion === 'Privado'}
                                                            <span class="material-symbols-outlined text-[12px] text-error">lock</span> Privado
                                                        {/if}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-lg py-md">
                                            <div class="flex gap-xs flex-wrap">
                                                {#each (doc.etiquetas || []) as etiqueta}
                                                    <span class="bg-surface-container-high px-2 py-0.5 rounded text-[11px] text-on-surface-variant font-bold border border-outline-variant/30">{etiqueta}</span>
                                                {/each}
                                                {#if !doc.etiquetas || doc.etiquetas.length === 0}
                                                    <span class="text-outline text-[11px] italic">Sin etiquetas</span>
                                                {/if}
                                            </div>
                                        </td>
                                        <td class="px-lg py-md">
                                            <div class="flex items-center gap-2">
                                                <span class="material-symbols-outlined text-[16px] text-outline">account_circle</span>
                                                <span class="text-label-md text-on-surface-variant">{creador ? creador.nombre : 'Usuario'}</span>
                                            </div>
                                        </td>
                                        <td class="px-lg py-md text-right">
                                            <p class="font-bold text-label-md text-on-surface">
                                                {doc.fechaSubida?.toDate ? doc.fechaSubida.toDate().toLocaleDateString('es-MX') : 'Reciente'}
                                            </p>
                                            <button class="text-primary hover:underline text-[11px] font-bold mt-1">Ver panel &rarr;</button>
                                        </td>
                                    </tr>
                                {/each}
                            {/if}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Right: AI Preview Panel -->
        {#if isPreviewOpen && selectedDoc}
        {@const isImage = selectedDoc.tipoArchivo.includes('image') || selectedDoc.nombreOriginal.match(/\.(jpg|jpeg|png|gif)$/i)}
        {@const isPdf = selectedDoc.tipoArchivo.includes('pdf') || selectedDoc.nombreOriginal.endsWith('.pdf')}
        {@const isWord = selectedDoc.tipoArchivo.includes('word') || selectedDoc.nombreOriginal.endsWith('.docx')}
        <div class="col-span-12 lg:col-span-4 bg-white rounded-2xl border border-outline-variant flex flex-col overflow-hidden shadow-lg h-[80vh] sticky top-24 animation-slide-in">
            <div class="p-lg bg-surface-container-lowest border-b border-outline-variant flex justify-between items-start">
                <div>
                    <span class="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest mb-xs inline-block">Vista Previa</span>
                    <h3 class="font-bold text-headline-md text-on-surface line-clamp-1" title={selectedDoc.nombreOriginal}>{selectedDoc.nombreOriginal}</h3>
                </div>
                <button onclick={closePreview} class="text-outline hover:text-on-surface transition-colors p-1 bg-surface-container rounded-full">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            
            <div class="p-md overflow-y-auto flex-1 custom-scrollbar space-y-md">
                
                <!-- Preview Embed -->
                <div class="relative w-full aspect-auto min-h-[250px] rounded-lg border border-outline-variant bg-surface-container flex items-center justify-center overflow-hidden">
                    
                    {#if isImage}
                        <img src={selectedDoc.url} alt="Preview" class="w-full h-full object-contain">
                    {:else if isPdf}
                        <iframe src={selectedDoc.url} class="w-full h-full min-h-[300px]" title="PDF Preview"></iframe>
                    {:else if isWord}
                        <iframe src={`https://docs.google.com/gview?url=${selectedDoc.url}&embedded=true`} class="w-full h-full min-h-[300px]" title="Word Preview"></iframe>
                    {:else}
                        <div class="flex flex-col items-center text-outline">
                            <span class="material-symbols-outlined text-[48px] mb-2">insert_drive_file</span>
                            <p class="text-label-md">Vista previa no disponible</p>
                        </div>
                    {/if}
                    
                    <a href={selectedDoc.url} target="_blank" class="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors backdrop-blur" title="Abrir en pestaña nueva">
                        <span class="material-symbols-outlined text-[20px]">open_in_new</span>
                    </a>
                </div>

                <!-- Permisos -->
                <div class="bg-surface-container-lowest border border-outline-variant p-md rounded-xl">
                    <h4 class="font-bold text-label-sm text-outline uppercase tracking-wider mb-sm">Nivel de Acceso</h4>
                    <div class="flex items-center gap-2">
                        {#if selectedDoc.permisoVisualizacion === 'Privado'}
                            <span class="material-symbols-outlined text-error">lock</span>
                            <span class="font-bold text-body-md">Privado (Solo tú y Admin)</span>
                        {:else}
                            <span class="material-symbols-outlined text-primary">public</span>
                            <span class="font-bold text-body-md">Público (Toda la firma)</span>
                        {/if}
                    </div>
                </div>

                <!-- AI Placeholder -->
                <div class="bg-primary/5 border border-primary/20 p-md rounded-xl space-y-sm">
                    <div class="flex items-center gap-2 text-primary">
                        <span class="material-symbols-outlined text-[20px]">auto_awesome</span>
                        <h4 class="font-bold text-label-md uppercase tracking-tight">Análisis IA (Próximamente)</h4>
                    </div>
                    <p class="text-body-md text-on-surface-variant text-sm">
                        La integración con IA analizará este documento automáticamente para extraer:
                    </p>
                    <ul class="text-sm text-on-surface-variant ml-4 list-disc space-y-1 opacity-70">
                        <li>Resumen Ejecutivo</li>
                        <li>Riesgos Legales Ocultos</li>
                        <li>Vinculación Automática con Clientes</li>
                    </ul>
                </div>
            </div>

            <!-- Quick Actions Footer -->
            <div class="p-md border-t border-outline-variant bg-surface-container-lowest grid grid-cols-3 gap-sm">
                <button onclick={() => forceDownload(selectedDoc.url, selectedDoc.nombreOriginal)} class="p-sm bg-white border border-outline-variant rounded-lg text-outline hover:text-primary hover:border-primary hover:bg-primary/5 transition-all flex flex-col items-center cursor-pointer">
                    <span class="material-symbols-outlined text-[20px]">download</span>
                    <span class="text-[10px] font-bold mt-1">Descargar</span>
                </button>
                <a href={`https://docs.google.com/viewer?url=${encodeURIComponent(selectedDoc.url)}`} target="_blank" class="p-sm bg-white border border-outline-variant rounded-lg text-outline hover:text-[#185abd] hover:border-[#185abd] hover:bg-[#185abd]/5 transition-all flex flex-col items-center cursor-pointer" title="Visor Web y Opciones de Impresión">
                    <span class="material-symbols-outlined text-[20px]">preview</span>
                    <span class="text-[10px] font-bold mt-1 text-center">Lector Docs<br>(IMPRIMIR)</span>
                </a>
                <button onclick={async () => { if(confirm('¿Eliminar documento permanentemente?')) { await deleteDocumento(selectedDoc.id, selectedDoc.storagePath); closePreview(); } }} class="p-sm bg-white border border-outline-variant rounded-lg text-outline hover:text-error hover:border-error hover:bg-error/5 transition-all flex flex-col items-center">
                    <span class="material-symbols-outlined text-[20px]">delete</span>
                    <span class="text-[10px] font-bold mt-1">Eliminar</span>
                </button>
            </div>
        </div>
        {/if}
    </div>
</div>

<!-- Upload Configuration Modal -->
{#if isUploadModalOpen}
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl w-[90%] md:w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
            <div class="p-lg border-b border-outline-variant bg-surface-container-lowest flex justify-between items-center">
                <div>
                    <h3 class="font-bold text-headline-md text-on-surface">Configurar Documentos</h3>
                    <p class="text-body-md text-on-surface-variant">Asigna nombres y permisos antes de subirlos a la Bóveda</p>
                </div>
                <button onclick={cancelUpload} class="p-2 hover:bg-surface-container rounded-full text-outline hover:text-on-surface transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            
            <div class="flex-1 overflow-y-auto p-lg space-y-xl custom-scrollbar">
                {#each pendingFiles as fileObj, index}
                    <div class="bg-white border border-outline-variant rounded-xl p-md shadow-sm">
                        <div class="flex gap-md mb-md">
                            <div class="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <span class="material-symbols-outlined text-[24px]">insert_drive_file</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <label class="block text-label-sm font-bold text-outline uppercase mb-1">Nombre del Documento</label>
                                <input type="text" bind:value={pendingFiles[index].nombrePersonalizado} class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all">
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
                            <div>
                                <label class="block text-label-sm font-bold text-outline uppercase mb-1">Nivel de Acceso</label>
                                <select bind:value={pendingFiles[index].permisoVisualizacion} class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-body-md outline-none">
                                    <option value="Publico">Público (Toda la firma)</option>
                                    <option value="Privado">Privado (Solo tú y Admin)</option>
                                    <option value="Compartido">Compartido (Solo elegidos)</option>
                                </select>
                            </div>
                            
                            {#if pendingFiles[index].permisoVisualizacion === 'Compartido'}
                                <div class="col-span-1 md:col-span-2">
                                    <label class="block text-label-sm font-bold text-outline uppercase mb-2">Seleccionar Empleados</label>
                                    <div class="flex flex-wrap gap-2">
                                        {#each empleados as emp}
                                            {#if emp.authUid !== $authStore.user?.uid}
                                                <label class="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg border border-outline-variant/50 cursor-pointer hover:bg-surface-container-high transition-colors">
                                                    <input type="checkbox" value={emp.authUid} bind:group={pendingFiles[index].compartidoCon} class="text-primary rounded focus:ring-primary">
                                                    <span class="text-label-md">{emp.nombre}</span>
                                                </label>
                                            {/if}
                                        {/each}
                                    </div>
                                    {#if pendingFiles[index].compartidoCon.length === 0}
                                        <p class="text-xs text-error mt-1">Debes seleccionar al menos un empleado.</p>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
            
            <div class="p-md border-t border-outline-variant bg-surface-container-lowest flex justify-end gap-md">
                <button onclick={cancelUpload} class="px-md py-sm font-bold text-label-md text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
                    Cancelar
                </button>
                <button onclick={confirmUpload} disabled={isUploading} class="px-xl py-sm font-bold text-label-md bg-primary text-on-primary rounded-lg shadow-md hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2">
                    {#if isUploading}
                        <span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Procesando...
                    {:else}
                        <span class="material-symbols-outlined text-[18px]">cloud_upload</span> Guardar y Subir
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    .animation-slide-in {
        animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .animation-scale {
        animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes slideInRight {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
    }
    @keyframes scaleIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
</style>
