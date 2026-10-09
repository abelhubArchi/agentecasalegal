<script>
    import { onMount, onDestroy } from 'svelte';
    import { subscribeToTransacciones, addTransaccion, uploadRecibo, subscribeToContratos, addContratoRecurrente, updateTransaccion, getTotales, getTransaccionesPorRango } from '$lib/firebase/finanzas.js';
    import { subscribeToEmpleados } from '$lib/firebase/empleados.js';
    import { addEvento } from '$lib/firebase/agenda.js';
    import { authStore } from '$lib/stores/auth.js';
    import { modoCelular } from '$lib/stores/ui.js';
    import jsPDF from 'jspdf';
    import autoTable from 'jspdf-autotable';
    
    let transacciones = $state([]);
    let contratos = $state([]);
    let empleados = $state([]);
    let loading = $state(true);
    let limiteTransacciones = $state(50);
    let unsubscribeT = null;
    let unsubscribeC = null;
    let unsubscribeE = null;
    
    // Auth & Permissions
    let currentEmpleado = $derived(empleados.find(e => e.authUid === $authStore.user?.uid));
    let isAdministrador = $derived($authStore.profile?.nivelAcceso === 'admin' || $authStore.profile?.role === 'admin' || (!currentEmpleado || currentEmpleado.rol === 'Administrador'));
    
    let filtroEmpleadoId = $state('todos');

    let transaccionesPermitidas = $derived(transacciones.filter(t => {
        if (!isAdministrador) return t.creadoPor === $authStore.user?.uid;
        if (filtroEmpleadoId !== 'todos') return t.creadoPor === filtroEmpleadoId;
        return true;
    }));
    
    // View state
    let activeTab = $state('movimientos'); // 'movimientos' | 'recurrentes'
    
    // Form state - Movimiento
    let isSubmitting = $state(false);
    let formTipo = $state('Ingreso');
    let formMonto = $state('');
    let formConcepto = $state('');
    let formCategoria = $state('Honorarios');
    let customCategoria = $state('');
    let formNotas = $state('');
    let formReciboFile = $state(null);
    let fileInputRef = $state(null);
    
    // Derived Stats (Historico desde DB)
    let totalIngresos = $state(0);
    let totalEgresos = $state(0);
    let utilidadNeta = $derived(totalIngresos - totalEgresos);

    $effect(() => {
        if ($authStore.user) {
            const uid = isAdministrador ? filtroEmpleadoId : $authStore.user.uid;
            getTotales(uid).then(t => {
                totalIngresos = t.ingresos;
                totalEgresos = t.egresos;
            });
        }
    });
    
    // Re-fetch totales si transacciones cambia (para reflejar nuevos registros)
    $effect(() => {
        if (transacciones && $authStore.user) {
            const uid = isAdministrador ? filtroEmpleadoId : $authStore.user.uid;
            getTotales(uid).then(t => {
                totalIngresos = t.ingresos;
                totalEgresos = t.egresos;
            });
        }
    });
    
    onMount(() => {
        unsubscribeT = subscribeToTransacciones(limiteTransacciones, data => {
            transacciones = data;
            loading = false;
        });
        unsubscribeC = subscribeToContratos(data => {
            contratos = data;
        });
        unsubscribeE = subscribeToEmpleados(data => {
            empleados = data;
        });
    });
    
    onDestroy(() => {
        if(unsubscribeT) unsubscribeT();
        if(unsubscribeC) unsubscribeC();
        if(unsubscribeE) unsubscribeE();
    });
    
    function loadMore() {
        limiteTransacciones += 50;
        if (unsubscribeT) unsubscribeT();
        unsubscribeT = subscribeToTransacciones(limiteTransacciones, data => {
            transacciones = data;
        });
    }

    function formatCurrency(monto) {
        return `Bs. ${monto.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    async function handleAddMovimiento(e) {
        e.preventDefault();
        if (!formMonto || !formConcepto) return alert("Llena el monto y concepto");
        
        isSubmitting = true;
        try {
            let reciboUrl = null;
            if (formReciboFile) {
                reciboUrl = await uploadRecibo(formReciboFile);
            }
            
            const categoriaFinal = formCategoria === 'Otro' ? customCategoria : formCategoria;
            
            await addTransaccion({
                tipo: formTipo,
                monto: parseFloat(formMonto),
                concepto: formConcepto,
                categoria: categoriaFinal,
                notas: formNotas,
                reciboUrl,
                fechaHora: new Date(),
                creadoPor: $authStore.user?.uid
            });
            
            // Reset form
            formMonto = '';
            formConcepto = '';
            formNotas = '';
            formReciboFile = null;
            if (fileInputRef) fileInputRef.value = '';
            alert("Movimiento guardado exitosamente");
        } catch (error) {
            console.error(error);
            alert("Error al guardar el movimiento");
        } finally {
            isSubmitting = false;
        }
    }
    // Modals state
    let editingTx = $state(null);
    let editTipo = $state('');
    let editMonto = $state('');
    let editConcepto = $state('');
    let editCategoria = $state('');
    let isSavingEdit = $state(false);

    function openEditTx(tx) {
        editingTx = tx;
        editTipo = tx.tipo;
        editMonto = tx.monto;
        editConcepto = tx.concepto;
        editCategoria = tx.categoria;
    }

    async function saveEditTx() {
        if (!editMonto || !editConcepto) return alert("Llena los campos");
        isSavingEdit = true;
        try {
            await updateTransaccion(editingTx.id, {
                tipo: editTipo,
                monto: parseFloat(editMonto),
                concepto: editConcepto,
                categoria: editCategoria
            });
            editingTx = null;
            alert("Movimiento editado exitosamente");
        } catch(e) {
            console.error(e);
            alert("Error al actualizar");
        } finally {
            isSavingEdit = false;
        }
    }

    function canEditTx(trx) {
        // Solo permitir editar el último movimiento (el más reciente) subido por el creador
        const creadorTxs = transacciones.filter(t => t.creadoPor === trx.creadoPor);
        const isLatest = creadorTxs.length > 0 && trx.id === creadorTxs[0].id;

        if (isAdministrador) {
            return isLatest; // El administrador también obedece la regla de inmutabilidad histórica
        }
        
        return trx.creadoPor === $authStore.user?.uid && isLatest;
    }

    // Reporte
    let isReportModalOpen = $state(false);
    let reportInicio = $state('');
    let reportFin = $state('');
    let isGeneratingReport = $state(false);

    async function fetchImageAsBase64(url) {
        if (!url) return null;
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.warn("CORS/Image error", e);
            return null;
        }
    }

    async function handleGenerateReport() {
        if (!reportInicio || !reportFin) return alert("Selecciona ambas fechas");
        isGeneratingReport = true;
        try {
            const iDate = new Date(reportInicio);
            iDate.setHours(0,0,0,0);
            const fDate = new Date(reportFin);
            fDate.setHours(23,59,59,999);
            
            const filterUid = isAdministrador ? filtroEmpleadoId : $authStore.user?.uid;
            const txs = await getTransaccionesPorRango(iDate, fDate, filterUid);
            
            const doc = new jsPDF();
            doc.setFontSize(22);
            doc.setTextColor(20, 20, 20);
            doc.text("Reporte de Flujo de Efectivo", 14, 22);
            
            let currentY = 42;
            const photoUrl = $authStore.profile?.photoURL;
            if (photoUrl) {
                const base64Img = await fetchImageAsBase64(photoUrl);
                if (base64Img) {
                    doc.addImage(base64Img, 14, 26, 12, 12);
                    doc.setFontSize(11);
                    doc.setTextColor(100, 100, 100);
                    doc.text(`Generado por: ${$authStore.profile?.name || 'Usuario'}`, 30, 30);
                    doc.text(`Rango: ${iDate.toLocaleDateString('es-BO')} al ${fDate.toLocaleDateString('es-BO')}`, 30, 36);
                    currentY = 46;
                } else {
                    doc.setFontSize(11);
                    doc.setTextColor(100, 100, 100);
                    doc.text(`Generado por: ${$authStore.profile?.name || 'Usuario'}`, 14, 30);
                    doc.text(`Rango: ${iDate.toLocaleDateString('es-BO')} al ${fDate.toLocaleDateString('es-BO')}`, 14, 36);
                }
            } else {
                doc.setFontSize(11);
                doc.setTextColor(100, 100, 100);
                doc.text(`Generado por: ${$authStore.profile?.name || 'Usuario'}`, 14, 30);
                doc.text(`Rango: ${iDate.toLocaleDateString('es-BO')} al ${fDate.toLocaleDateString('es-BO')}`, 14, 36);
            }
            
            let sumIng = 0;
            let sumEgr = 0;
            const tableData = txs.map(t => {
                if(t.tipo === 'Ingreso') sumIng += t.monto;
                if(t.tipo === 'Egreso') sumEgr += t.monto;
                const d = t.fechaHora?.toDate ? t.fechaHora.toDate() : (t.fechaHora ? new Date(t.fechaHora) : new Date());
                return [
                    d.toLocaleDateString('es-BO'),
                    t.tipo,
                    t.concepto,
                    t.categoria,
                    `${t.tipo === 'Ingreso' ? '+' : '-'} Bs. ${t.monto.toLocaleString('es-BO')}`
                ];
            });
            
            autoTable(doc, {
                startY: currentY,
                head: [['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Monto']],
                body: tableData,
                theme: 'striped',
                headStyles: { fillColor: [15, 23, 42] },
                didParseCell: function(data) {
                    if (data.section === 'body') {
                        const tipo = data.row.raw[1];
                        if (tipo === 'Ingreso') {
                            if (data.column.index === 1 || data.column.index === 4) {
                                data.cell.styles.textColor = [34, 197, 94];
                                data.cell.styles.fontStyle = 'bold';
                            }
                        } else if (tipo === 'Egreso') {
                            if (data.column.index === 1 || data.column.index === 4) {
                                data.cell.styles.textColor = [239, 68, 68];
                                data.cell.styles.fontStyle = 'bold';
                            }
                        }
                    }
                }
            });
            
            const finalY = doc.lastAutoTable?.finalY || currentY;
            doc.setFontSize(12);
            doc.setTextColor(20, 20, 20);
            doc.text(`Total Ingresos: Bs. ${sumIng.toLocaleString('es-BO')}`, 14, finalY + 10);
            doc.text(`Total Egresos: Bs. ${sumEgr.toLocaleString('es-BO')}`, 14, finalY + 18);
            
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(`Utilidad Neta: Bs. ${(sumIng - sumEgr).toLocaleString('es-BO')}`, 14, finalY + 28);
            
            doc.save(`Flujo_Efectivo_${Date.now()}.pdf`);
            isReportModalOpen = false;
        } catch(e) {
            console.error(e);
            alert("Error al generar reporte");
        } finally {
            isGeneratingReport = false;
        }
    }
    
    // Form State - Recurrente (Alquiler)
    let recConcepto = $state('');
    let recMonto = $state('');
    let recDiaCobro = $state('1');
    let recCliente = $state('');
    
    async function handleAddContrato(e) {
        e.preventDefault();
        if (!recConcepto || !recMonto || !recDiaCobro) return alert("Llenar campos obligatorios");
        
        isSubmitting = true;
        try {
            // 1. Guardar contrato recurrente
            await addContratoRecurrente({
                concepto: recConcepto,
                monto: parseFloat(recMonto),
                diaCobro: parseInt(recDiaCobro),
                cliente: recCliente,
                estado: 'Activo',
                creadoPor: $authStore.user?.uid
            });
            
            // 2. Programar el próximo evento en el Calendario Automáticamente!
            const hoy = new Date();
            let proximoMes = hoy.getMonth() + 1;
            let anio = hoy.getFullYear();
            if (proximoMes > 11) { proximoMes = 0; anio++; }
            
            const fechaCobro = new Date(anio, proximoMes, parseInt(recDiaCobro), 9, 0); // 9:00 AM
            
            await addEvento({
                titulo: `Cobro: ${recConcepto}`,
                tipo: 'Cobro Alquiler',
                fechaHora: fechaCobro,
                asignadoA: 'todos', // Todo el equipo se entera que hay que cobrar
                notas: `Monto: ${formatCurrency(parseFloat(recMonto))} | Cliente: ${recCliente}`,
                estado: 'Pendiente',
                creadoPor: $authStore.user?.uid
            });
            
            recConcepto = '';
            recMonto = '';
            recCliente = '';
            alert("Contrato creado y recordatorio añadido al calendario.");
        } catch(error) {
            console.error(error);
            alert("Error al guardar el contrato");
        } finally {
            isSubmitting = false;
        }
    }
</script>

<div class="p-4 md:p-lg max-w-[1440px] mx-auto w-full pb-24 md:pb-lg relative">
    <!-- Header Actions -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-end mb-xl gap-4">
        <div>
            <h2 class="font-headline-xl text-headline-xl text-on-surface tracking-tight">Flujo de Efectivo</h2>
            <p class="text-body-md text-on-surface-variant">Bóveda, Control financiero y gastos.</p>
        </div>
        <div class="flex flex-col md:flex-row gap-sm w-full md:w-auto">
            <button onclick={() => $modoCelular = !$modoCelular} class="w-full md:w-auto bg-surface-container-high border border-outline-variant py-sm px-md rounded-xl font-bold flex items-center justify-center gap-xs hover:bg-surface-variant transition-colors">
                <span class="material-symbols-outlined">{$modoCelular ? 'desktop_windows' : 'smartphone'}</span>
                {$modoCelular ? 'Salir Modo Celular' : 'Modo Celular (Rápido)'}
            </button>
            
            {#if !$modoCelular}
                <div class="flex gap-sm w-full md:w-auto">
                    <button onclick={() => activeTab = 'movimientos'} class="flex-1 md:flex-none py-sm px-md rounded-xl font-bold {activeTab === 'movimientos' ? 'bg-primary text-on-primary shadow-md' : 'bg-surface-container border border-outline-variant text-on-surface-variant'} transition-all">
                        Caja
                    </button>
                    <button onclick={() => isReportModalOpen = true} class="flex-1 md:flex-none py-sm px-md rounded-xl font-bold bg-surface-container border border-outline-variant text-on-surface-variant hover:bg-surface-variant transition-all flex items-center gap-2">
                        <span class="material-symbols-outlined">picture_as_pdf</span> Generar Reporte
                    </button>
                </div>
            {/if}
        </div>
    </div>

    {#if !$modoCelular}
    {#if isAdministrador}
        <div class="mb-md flex justify-end">
            <select bind:value={filtroEmpleadoId} class="bg-surface border border-outline-variant rounded-lg px-4 py-2 font-bold text-label-md shadow-sm outline-none focus:ring-1 focus:ring-primary">
                <option value="todos">Vista General (Todos)</option>
                {#each empleados as emp}
                    <option value={emp.authUid}>{emp.nombre} {emp.apellidos}</option>
                {/each}
            </select>
        </div>
    {/if}
    <!-- Dashboard Overview (Bento Grid) -->
    <div class="grid grid-cols-12 gap-lg mb-2xl">
        <!-- Ingresos Total Card -->
        <div class="col-span-12 md:col-span-4 bg-white/80 backdrop-blur-md border border-outline-variant p-lg rounded-2xl shadow-sm relative overflow-hidden group">
            <div class="absolute top-0 right-0 p-lg opacity-10 group-hover:scale-110 transition-transform">
                <span class="material-symbols-outlined text-[64px] text-primary">trending_up</span>
            </div>
            <div class="flex items-center gap-sm text-primary mb-md">
                <span class="material-symbols-outlined">account_balance</span>
                <span class="font-bold text-label-sm uppercase tracking-wider">Ingresos Totales</span>
            </div>
            <div class="font-display-lg text-display-lg text-on-surface">{formatCurrency(totalIngresos)}</div>
        </div>

        <!-- Egresos Total Card -->
        <div class="col-span-12 md:col-span-4 bg-white/80 backdrop-blur-md border border-outline-variant p-lg rounded-2xl shadow-sm relative overflow-hidden group">
            <div class="absolute top-0 right-0 p-lg opacity-10 group-hover:scale-110 transition-transform">
                <span class="material-symbols-outlined text-[64px] text-error">trending_down</span>
            </div>
            <div class="flex items-center gap-sm text-error mb-md">
                <span class="material-symbols-outlined">payments</span>
                <span class="font-bold text-label-sm uppercase tracking-wider">Egresos Totales</span>
            </div>
            <div class="font-display-lg text-display-lg text-on-surface">{formatCurrency(totalEgresos)}</div>
        </div>

        <!-- Net Profit Card -->
        <div class="col-span-12 md:col-span-4 {utilidadNeta >= 0 ? 'bg-primary' : 'bg-error'} text-on-primary p-lg rounded-2xl shadow-xl relative overflow-hidden transition-colors">
            <div class="relative z-10">
                <div class="flex items-center gap-sm text-primary-fixed mb-md">
                    <span class="material-symbols-outlined">savings</span>
                    <span class="font-bold text-label-sm uppercase tracking-wider">Utilidad Neta</span>
                </div>
                <div class="font-display-lg text-display-lg">{formatCurrency(utilidadNeta)}</div>
            </div>
        </div>
    </div>
    {/if}

    <!-- Main Content Area Split -->
    <div class="grid grid-cols-1 {$modoCelular ? 'lg:grid-cols-1' : 'lg:grid-cols-12'} gap-xl w-full">
        
        <!-- Left Column: Form (Mobile first view) -->
        <div class="{$modoCelular ? 'col-span-1 w-full max-w-[600px] mx-auto block' : 'col-span-1 lg:col-span-4'} order-first lg:order-last">
            {#if activeTab === 'movimientos'}
                <!-- Formulario Rápido de Gastos/Ingresos -->
                <div class="bg-white rounded-2xl border border-outline-variant p-lg shadow-md w-full {$modoCelular ? 'relative block' : 'sticky top-24'}">
                    <h4 class="font-bold text-headline-md mb-lg text-on-surface">Registro Rápido</h4>
                    <form onsubmit={handleAddMovimiento} class="space-y-md">
                        <!-- Selector de Tipo -->
                        <div class="flex gap-2 p-1 bg-surface-container rounded-xl">
                            <button type="button" onclick={() => formTipo = 'Ingreso'} class="flex-1 py-sm rounded-lg font-bold transition-all {formTipo === 'Ingreso' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high'}">Ingreso</button>
                            <button type="button" onclick={() => formTipo = 'Egreso'} class="flex-1 py-sm rounded-lg font-bold transition-all {formTipo === 'Egreso' ? 'bg-error text-on-error shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high'}">Gasto</button>
                        </div>
                        
                        <div>
                            <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Monto (Bs.)</label>
                            <input bind:value={formMonto} type="number" step="0.01" class="w-full bg-background border-none rounded-xl py-md px-md text-headline-md font-bold text-center focus:ring-2 focus:ring-primary/20 transition-all" placeholder="0.00" required>
                        </div>
                        
                        <div>
                            <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Concepto</label>
                            <input bind:value={formConcepto} type="text" class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all placeholder:opacity-50" placeholder="Ej. Garrafón de Agua" required>
                        </div>
                        
                        <div>
                            <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Categoría</label>
                            <select bind:value={formCategoria} class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all">
                                <option>Procesos</option>
                                <option>Honorarios</option>
                                <option>Consultas</option>
                                <option>Insumos de Oficina</option>
                                <option>Transporte / Pasajes</option>
                                <option>Sueldos</option>
                                <option>Impuestos</option>
                                <option>Otro</option>
                            </select>
                            {#if formCategoria === 'Otro'}
                                <input bind:value={customCategoria} type="text" placeholder="Escribe la categoría" class="w-full mt-2 bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all" required>
                            {/if}
                        </div>
                        
                        <!-- File Upload -->
                        <div>
                            <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Recibo / Factura (Foto)</label>
                            <input 
                                bind:this={fileInputRef}
                                type="file" 
                                accept="image/*" 
                                capture="environment" 
                                class="hidden"
                                onchange={(e) => formReciboFile = e.target.files[0]}
                            >
                            <button type="button" onclick={() => fileInputRef.click()} class="w-full flex items-center justify-center gap-sm bg-surface-container-high border border-outline-variant border-dashed text-on-surface-variant py-md rounded-xl hover:bg-surface-variant transition-colors font-bold">
                                {#if formReciboFile}
                                    <span class="material-symbols-outlined text-primary">check_circle</span>
                                    <span class="text-primary truncate">{formReciboFile.name}</span>
                                {:else}
                                    <span class="material-symbols-outlined">add_a_photo</span>
                                    <span>Tomar Foto / Subir Archivo</span>
                                {/if}
                            </button>
                        </div>
                        
                        <button type="submit" disabled={isSubmitting} class="w-full bg-secondary text-on-secondary font-bold text-label-lg py-md rounded-xl shadow-md active:scale-[0.98] transition-all flex justify-center items-center gap-xs">
                            {#if isSubmitting}
                                <span class="material-symbols-outlined animate-spin">progress_activity</span> Guardando...
                            {:else}
                                <span class="material-symbols-outlined">save</span> Guardar Transacción
                            {/if}
                        </button>
                    </form>
                </div>
            {:else}
                <!-- Formulario Recurrentes (Inmobiliaria) -->
                <div class="bg-white rounded-2xl border border-outline-variant p-lg shadow-md w-full {$modoCelular ? 'relative block' : 'sticky top-24'}">
                    <h4 class="font-bold text-headline-md mb-lg text-on-surface">Nuevo Alquiler / Fijo</h4>
                    <form onsubmit={handleAddContrato} class="space-y-md">
                        <div>
                            <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Concepto del Cobro</label>
                            <input bind:value={recConcepto} type="text" class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all placeholder:opacity-50" placeholder="Ej. Alquiler Dpto 402" required>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-md">
                            <div>
                                <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Monto Mensual</label>
                                <input bind:value={recMonto} type="number" step="0.01" class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all" placeholder="1000" required>
                            </div>
                            <div>
                                <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Día de Cobro</label>
                                <input bind:value={recDiaCobro} type="number" min="1" max="31" class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all" placeholder="Ej. 15" required>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Inquilino / Cliente</label>
                            <input bind:value={recCliente} type="text" class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all placeholder:opacity-50" placeholder="Nombre de quien paga" required>
                        </div>

                        <div class="p-sm bg-primary/10 rounded-lg text-label-sm text-primary-fixed-variant flex items-start gap-sm">
                            <span class="material-symbols-outlined text-[16px]">info</span>
                            <p>Se creará automáticamente un evento recordatorio en el calendario cada mes para este cobro.</p>
                        </div>
                        
                        <button type="submit" disabled={isSubmitting} class="w-full bg-secondary text-on-secondary font-bold text-label-lg py-md rounded-xl shadow-md active:scale-[0.98] transition-all flex justify-center items-center gap-xs">
                            {#if isSubmitting}
                                <span class="material-symbols-outlined animate-spin">progress_activity</span> Programando...
                            {:else}
                                <span class="material-symbols-outlined">calendar_add_on</span> Crear Cobro Recurrente
                            {/if}
                        </button>
                    </form>
                </div>
            {/if}
        </div>
        
        {#if !$modoCelular}
        <!-- Right Column: Historial / Data -->
        <div class="col-span-1 lg:col-span-8 order-last lg:order-first">
            {#if activeTab === 'movimientos'}
                <div class="bg-white rounded-2xl border border-outline-variant overflow-hidden shadow-sm">
                    <div class="p-lg border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                        <h3 class="font-bold text-headline-md">Historial de Movimientos (Recientes)</h3>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-surface-container-low border-b border-outline-variant">
                                    <th class="px-lg py-md font-bold text-label-md text-on-surface-variant uppercase tracking-wider">Fecha</th>
                                    <th class="px-lg py-md font-bold text-label-md text-on-surface-variant uppercase tracking-wider">Concepto</th>
                                    <th class="px-lg py-md font-bold text-label-md text-on-surface-variant uppercase tracking-wider">Categoría</th>
                                    <th class="px-lg py-md font-bold text-label-md text-on-surface-variant uppercase tracking-wider">Monto</th>
                                    <th class="px-lg py-md font-bold text-label-md text-on-surface-variant uppercase tracking-wider">Comprobante</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-outline-variant">
                                {#if loading}
                                    <tr><td colspan="5" class="text-center p-xl"><span class="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span></td></tr>
                                {:else if transaccionesPermitidas.length === 0}
                                    <tr><td colspan="5" class="text-center p-xl text-on-surface-variant">No hay movimientos registrados.</td></tr>
                                {:else}
                                    {#each transaccionesPermitidas as trx}
                                        {@const trxDate = trx.fechaHora.toDate ? trx.fechaHora.toDate() : new Date(trx.fechaHora)}
                                        <tr class="hover:bg-surface-container-highest/10 transition-colors">
                                            <td class="px-lg py-md whitespace-nowrap text-label-md text-on-surface-variant">
                                                {trxDate.toLocaleDateString('es-BO')} <br>
                                                <span class="text-[11px] opacity-70">{trxDate.toLocaleTimeString('es-BO', {hour:'2-digit', minute:'2-digit'})}</span>
                                            </td>
                                            <td class="px-lg py-md font-bold text-on-surface">
                                                {trx.concepto}
                                                {#if isAdministrador && trx.creadoPor !== $authStore.user?.uid}
                                                    {@const creador = empleados.find(e => e.authUid === trx.creadoPor)}
                                                    <div class="text-[10px] text-on-surface-variant/60 uppercase mt-1 flex items-center gap-1">
                                                        <span class="material-symbols-outlined text-[12px]">person</span> {creador ? creador.nombre : 'Empleado'}
                                                    </div>
                                                {/if}
                                            </td>
                                            <td class="px-lg py-md text-label-sm text-on-surface-variant">
                                                <span class="bg-surface-container px-2 py-1 rounded-full border border-outline-variant/30">{trx.categoria}</span>
                                            </td>
                                            <td class="px-lg py-md font-bold {trx.tipo === 'Ingreso' ? 'text-primary' : 'text-error'}">
                                                {trx.tipo === 'Ingreso' ? '+' : '-'}{formatCurrency(trx.monto)}
                                            </td>
                                            <td class="px-lg py-md text-center flex items-center gap-2">
                                                {#if trx.reciboUrl}
                                                    <a href={trx.reciboUrl} target="_blank" class="p-2 bg-surface-container-high rounded-full inline-flex text-primary hover:bg-primary-container transition-colors" title="Ver Comprobante">
                                                        <span class="material-symbols-outlined text-[18px]">receipt_long</span>
                                                    </a>
                                                {/if}
                                                {#if canEditTx(trx)}
                                                    <button onclick={() => openEditTx(trx)} class="p-2 bg-surface-container-high rounded-full inline-flex text-secondary hover:bg-secondary-container transition-colors" title="Editar">
                                                        <span class="material-symbols-outlined text-[18px]">edit</span>
                                                    </button>
                                                {:else}
                                                    <button disabled class="p-2 bg-surface-container-low rounded-full inline-flex text-outline opacity-50 cursor-not-allowed" title="Solo puedes editar tu último movimiento registrado">
                                                        <span class="material-symbols-outlined text-[18px]">edit_off</span>
                                                    </button>
                                                {/if}
                                            </td>
                                        </tr>
                                    {/each}
                                {/if}
                            </tbody>
                        </table>
                    </div>
                    
                    {#if transacciones.length >= limiteTransacciones}
                        <div class="p-md flex justify-center border-t border-outline-variant bg-surface-container-lowest">
                            <button onclick={loadMore} class="bg-surface-container-high hover:bg-surface-variant text-on-surface py-2 px-6 rounded-full font-bold transition-colors shadow-sm">
                                Cargar más movimientos
                            </button>
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="bg-white rounded-2xl border border-outline-variant overflow-hidden shadow-sm">
                    <div class="p-lg border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                        <h3 class="font-bold text-headline-md">Alquileres y Cobros Activos</h3>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-md p-md">
                        {#if contratos.length === 0}
                            <div class="col-span-full text-center p-xl text-on-surface-variant">No hay cobros recurrentes registrados.</div>
                        {:else}
                            {#each contratos as contrato}
                                {@const diaHoy = new Date().getDate()}
                                {@const estado = contrato.diaCobro < diaHoy ? 'VENCIDO' : 'PRÓXIMO'}
                                <div class="bg-surface border {estado === 'VENCIDO' ? 'border-error/50 bg-error/5' : 'border-outline-variant'} p-md rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group">
                                    {#if estado === 'VENCIDO'}
                                        <div class="absolute top-0 left-0 w-1 h-full bg-error"></div>
                                    {/if}
                                    <div>
                                        <div class="flex justify-between items-start mb-sm">
                                            <h4 class="font-bold text-body-lg text-on-surface">{contrato.concepto}</h4>
                                            <span class="bg-surface-container text-on-surface-variant px-2 py-1 rounded text-label-sm font-bold flex items-center gap-1">
                                                <span class="material-symbols-outlined text-[14px]">event</span> Día {contrato.diaCobro}
                                            </span>
                                        </div>
                                        <p class="text-label-md text-on-surface-variant mb-xs"><span class="font-bold">Cliente:</span> {contrato.cliente}</p>
                                    </div>
                                    <div class="mt-md pt-sm border-t border-outline-variant/30 flex justify-between items-center">
                                        <span class="font-bold text-headline-md text-primary">{formatCurrency(contrato.monto)}</span>
                                        <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase {estado === 'VENCIDO' ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'}">
                                            {estado}
                                        </span>
                                    </div>
                                </div>
                            {/each}
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
        {/if}
    </div>
</div>

<!-- Modal Edit Tx -->
{#if editingTx}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-surface rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden flex flex-col">
        <div class="p-lg border-b border-outline-variant bg-surface-container-lowest flex justify-between items-center shrink-0">
            <h3 class="font-bold text-headline-sm text-on-surface">Editar Movimiento</h3>
            <button onclick={() => editingTx = null} class="p-2 hover:bg-surface-container rounded-full text-outline transition-colors">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="p-lg flex flex-col gap-4">
            <div class="flex gap-2 p-1 bg-surface-container rounded-xl">
                <button type="button" onclick={() => editTipo = 'Ingreso'} class="flex-1 py-sm rounded-lg font-bold transition-all {editTipo === 'Ingreso' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high'}">Ingreso</button>
                <button type="button" onclick={() => editTipo = 'Egreso'} class="flex-1 py-sm rounded-lg font-bold transition-all {editTipo === 'Egreso' ? 'bg-error text-on-error shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high'}">Gasto</button>
            </div>
            <div>
                <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Monto (Bs.)</label>
                <input bind:value={editMonto} type="number" step="0.01" class="w-full bg-surface-container-low border border-outline-variant rounded-xl py-sm px-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none">
            </div>
            <div>
                <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Concepto</label>
                <input bind:value={editConcepto} type="text" class="w-full bg-surface-container-low border border-outline-variant rounded-xl py-sm px-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none">
            </div>
            <div>
                <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Categoría</label>
                <input bind:value={editCategoria} type="text" class="w-full bg-surface-container-low border border-outline-variant rounded-xl py-sm px-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none">
            </div>
        </div>
        <div class="p-lg border-t border-outline-variant bg-surface-container-lowest flex justify-end gap-3 shrink-0">
            <button onclick={() => editingTx = null} class="px-6 py-2 rounded-xl font-bold text-label-md text-on-surface-variant hover:bg-surface-container transition-colors">Cancelar</button>
            <button onclick={saveEditTx} disabled={isSavingEdit} class="px-6 py-2 rounded-xl font-bold text-label-md bg-primary text-on-primary hover:opacity-90 transition-opacity">
                {#if isSavingEdit} Guardando... {:else} Guardar Cambios {/if}
            </button>
        </div>
    </div>
</div>
{/if}

<!-- Modal Reporte -->
{#if isReportModalOpen}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-surface rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden flex flex-col">
        <div class="p-lg border-b border-outline-variant bg-surface-container-lowest flex justify-between items-center shrink-0">
            <h3 class="font-bold text-headline-sm text-on-surface">Generar Reporte</h3>
            <button onclick={() => isReportModalOpen = false} class="p-2 hover:bg-surface-container rounded-full text-outline transition-colors">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="p-lg flex flex-col gap-4">
            <p class="text-body-sm text-on-surface-variant">Selecciona el rango de fechas para generar el PDF con el resumen de movimientos y totales.</p>
            <div>
                <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Desde</label>
                <input bind:value={reportInicio} type="date" class="w-full bg-surface-container-low border border-outline-variant rounded-xl py-sm px-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none">
            </div>
            <div>
                <label class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs">Hasta</label>
                <input bind:value={reportFin} type="date" class="w-full bg-surface-container-low border border-outline-variant rounded-xl py-sm px-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none">
            </div>
        </div>
        <div class="p-lg border-t border-outline-variant bg-surface-container-lowest flex justify-end gap-3 shrink-0">
            <button onclick={() => isReportModalOpen = false} class="px-6 py-2 rounded-xl font-bold text-label-md text-on-surface-variant hover:bg-surface-container transition-colors">Cancelar</button>
            <button onclick={handleGenerateReport} disabled={isGeneratingReport} class="px-6 py-2 rounded-xl font-bold text-label-md bg-secondary text-on-secondary hover:opacity-90 transition-opacity flex items-center gap-2">
                {#if isGeneratingReport}
                    <span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Generando...
                {:else}
                    <span class="material-symbols-outlined text-[18px]">picture_as_pdf</span> Descargar PDF
                {/if}
            </button>
        </div>
    </div>
</div>
{/if}
