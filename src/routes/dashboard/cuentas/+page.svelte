<script>
    import { onMount, onDestroy } from "svelte";
    import {
        subscribeToTransacciones,
        addTransaccion,
        uploadRecibo,
        subscribeToContratos,
        addContratoRecurrente,
        updateTransaccion,
        getTotales,
        getTransaccionesPorRango,
        subscribeToCierresCaja,
        getTransaccionesAbiertas,
        ejecutarCierreDeCaja,
    } from "$lib/firebase/finanzas.js";
    import { subscribeToEmpleados } from "$lib/firebase/empleados.js";
    import { addEvento } from "$lib/firebase/agenda.js";
    import { authStore } from "$lib/stores/auth.js";
    import { modoCelular } from "$lib/stores/ui.js";
    import { empresaStore } from "$lib/stores/empresa.js";
    import { generarPdfCierreCaja } from "$lib/pdf/generador.js";
    import { db } from "$lib/firebase/client.js";
    import { collection, getDocs } from "firebase/firestore";
    import { notificarNuevoIngresoFinanciero, abrirEnGmail } from "$lib/services/notificaciones.js";
    import jsPDF from "jspdf";
    import autoTable from "jspdf-autotable";

    let transacciones = $state([]);
    let contratos = $state([]);
    let empleados = $state([]);
    let cierres = $state([]);
    let loading = $state(true);
    let limiteTransacciones = $state(100);
    let unsubscribeT = null;
    let unsubscribeC = null;
    let unsubscribeE = null;
    let unsubscribeCierres = null;

    // Auth & Permissions
    let currentEmpleado = $derived(
        empleados.find((e) => e.authUid === $authStore.user?.uid),
    );
    let isAdministrador = $derived(
        $authStore.profile?.nivelAcceso === "admin" ||
            $authStore.profile?.role === "admin" ||
            !currentEmpleado ||
            currentEmpleado.rol === "Administrador",
    );

    let filtroEmpleadoId = $state("todos");
    let cajaMode = $state("abierta"); // 'abierta' (turno actual, ceros tras cierre) | 'historico' (acumulado total)

    let transaccionesPermitidas = $derived(
        transacciones.filter((t) => {
            if (cajaMode === "abierta" && t.cerrado === true) return false;
            if (!isAdministrador) return t.creadoPor === $authStore.user?.uid;
            if (filtroEmpleadoId !== "todos")
                return t.creadoPor === filtroEmpleadoId;
            return true;
        }),
    );

    // View state
    let activeTab = $state("movimientos"); // 'movimientos' | 'cierres' | 'recurrentes'

    // Form state - Movimiento
    let isSubmitting = $state(false);
    let formTipo = $state("Ingreso");
    let formMonto = $state("");
    let formConcepto = $state("");
    let formCategoria = $state("Honorarios");
    let customCategoria = $state("");
    let formNotas = $state("");
    let formReciboFile = $state(null);
    let fileInputRef = $state(null);

    // Cierre de Caja States
    let isCerrarCajaModalOpen = $state(false);
    let isCerrandoCaja = $state(false);
    let arqueoPrevio = $state(null);
    let observacionesCierre = $state("");
    let isInformeCierreModalOpen = $state(false);
    let cierreSeleccionado = $state(null);
    let isDescargandoPdfCierre = $state(false);

    // Fecha y Hora de Corte configurables por el Administrador General
    let fechaCorteCierre = $state(new Date().toISOString().split("T")[0]);
    let horaCorteCierre = $state(new Date().toTimeString().slice(0, 5));
    let casosPorArchivar = $state([]);
    let cargandoArqueo = $state(false);

    function getCorteDateObj() {
        try {
            const [y, m, d] = (fechaCorteCierre || new Date().toISOString().split("T")[0]).split("-").map(Number);
            const [hh, mm] = (horaCorteCierre || "23:59").split(":").map(Number);
            return new Date(y, m - 1, d, hh || 0, mm || 0, 59, 999);
        } catch (e) {
            return new Date();
        }
    }

    function getNombreDiaSemana(fechaStr) {
        if (!fechaStr) return "";
        const [y, m, d] = fechaStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        return `${dias[date.getDay()]}, ${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
    }

    async function recalcularArqueo() {
        cargandoArqueo = true;
        try {
            const fechaObj = getCorteDateObj();
            arqueoPrevio = await getTransaccionesAbiertas(empleados, fechaObj);

            // Consultar trámites finalizados hasta la fecha/hora seleccionada
            const snapCasos = await getDocs(collection(db, "casos"));
            const porArchivar = [];
            snapCasos.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.estado === "Finalizado" && !data.archivado) {
                    const fc = data.fechaCreacion?.toDate
                        ? data.fechaCreacion.toDate()
                        : data.fechaCreacion
                          ? new Date(data.fechaCreacion)
                          : new Date(0);
                    if (fc <= fechaObj || isNaN(fechaObj.getTime())) {
                        porArchivar.push({ id: docSnap.id, ...data });
                    }
                }
            });
            casosPorArchivar = porArchivar;
        } catch (e) {
            console.error("Error al recalcular arqueo:", e);
        } finally {
            cargandoArqueo = false;
        }
    }

    // Derived Stats
    let totalIngresos = $state(0);
    let totalEgresos = $state(0);
    let utilidadNeta = $derived(totalIngresos - totalEgresos);

    async function refrescarTotales() {
        if ($authStore.user) {
            const uid = isAdministrador
                ? filtroEmpleadoId
                : $authStore.user.uid;
            const t = await getTotales(uid, cajaMode === "abierta");
            totalIngresos = t.ingresos;
            totalEgresos = t.egresos;
        }
    }

    $effect(() => {
        if ($authStore.user || cajaMode || filtroEmpleadoId) {
            refrescarTotales();
        }
    });

    // Re-fetch totales si transacciones cambia (para reflejar nuevos registros)
    $effect(() => {
        if (transacciones && $authStore.user) {
            refrescarTotales();
        }
    });

    onMount(() => {
        unsubscribeT = subscribeToTransacciones(limiteTransacciones, (data) => {
            transacciones = data;
            loading = false;
        });
        unsubscribeC = subscribeToContratos((data) => {
            contratos = data;
        });
        unsubscribeE = subscribeToEmpleados((data) => {
            empleados = data;
        });
        unsubscribeCierres = subscribeToCierresCaja((data) => {
            cierres = data;
        });
    });

    onDestroy(() => {
        if (unsubscribeT) unsubscribeT();
        if (unsubscribeC) unsubscribeC();
        if (unsubscribeE) unsubscribeE();
        if (unsubscribeCierres) unsubscribeCierres();
    });

    function getCierreFechaStr(cierre) {
        if (!cierre?.fechaHora) return "";
        const f = cierre.fechaHora.toDate
            ? cierre.fechaHora.toDate()
            : new Date(cierre.fechaHora);
        return f.toLocaleDateString("es-BO");
    }

    function getCierreHoraStr(cierre) {
        if (!cierre?.fechaHora) return "";
        const f = cierre.fechaHora.toDate
            ? cierre.fechaHora.toDate()
            : new Date(cierre.fechaHora);
        return f.toLocaleTimeString("es-BO", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    }

    async function abrirModalCerrarCaja() {
        try {
            const ahora = new Date();
            fechaCorteCierre = ahora.toISOString().split("T")[0];
            horaCorteCierre = ahora.toTimeString().slice(0, 5);
            observacionesCierre = "";
            await recalcularArqueo();
            isCerrarCajaModalOpen = true;
        } catch (e) {
            console.error("Error al preparar arqueo:", e);
            alert("No se pudo preparar el arqueo de caja.");
        }
    }

    async function handleConfirmarCierreCaja() {
        const fechaObj = getCorteDateObj();
        const fechaLegible = `${fechaCorteCierre} a las ${horaCorteCierre}`;
        if (
            !confirm(
                `¿Confirmas el Cierre de Caja General con fecha de corte ${fechaLegible}?\n\n• Los balances de todos los abogados y empleados quedarán en Bs. 0.00.\n• Se archivarán ${casosPorArchivar.length} trámites finalizados al Historial.\n• Se generará el acta oficial de auditoría.`,
            )
        ) {
            return;
        }

        isCerrandoCaja = true;
        try {
            const adminNombre =
                $authStore.profile?.name ||
                $authStore.profile?.nombre ||
                "Administrador General";
            const adminEmail = $authStore.user?.email || "admin@casalegal.bo";
            const adminUid = $authStore.user?.uid || "admin";

            const resultadoCierre = await ejecutarCierreDeCaja({
                adminUid,
                adminNombre,
                adminEmail,
                observaciones: observacionesCierre,
                empleados,
                fechaCorte: fechaObj,
            });

            isCerrarCajaModalOpen = false;
            cierreSeleccionado = resultadoCierre;
            isInformeCierreModalOpen = true;

            // Forzar actualización inmediata a 0
            totalIngresos = 0;
            totalEgresos = 0;
            await refrescarTotales();
        } catch (e) {
            console.error("Error cerrando caja:", e);
            alert("Ocurrió un error al ejecutar el cierre de caja.");
        } finally {
            isCerrandoCaja = false;
        }
    }

    function abrirDetalleCierre(cierre) {
        cierreSeleccionado = cierre;
        isInformeCierreModalOpen = true;
    }

    async function handleDescargarPdfCierre(cierre) {
        isDescargandoPdfCierre = true;
        try {
            await generarPdfCierreCaja(cierre, $empresaStore);
        } catch (e) {
            alert("Error al descargar el acta en PDF.");
        } finally {
            isDescargandoPdfCierre = false;
        }
    }

    function loadMore() {
        limiteTransacciones += 50;
        if (unsubscribeT) unsubscribeT();
        unsubscribeT = subscribeToTransacciones(limiteTransacciones, (data) => {
            transacciones = data;
        });
    }

    function formatCurrency(monto) {
        return `Bs. ${monto.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    async function handleAddMovimiento(e) {
        e.preventDefault();
        if (!formMonto || !formConcepto)
            return alert("Llena el monto y concepto");

        isSubmitting = true;
        try {
            let reciboUrl = null;
            if (formReciboFile) {
                reciboUrl = await uploadRecibo(formReciboFile);
            }

            const categoriaFinal =
                formCategoria === "Otro" ? customCategoria : formCategoria;

            await addTransaccion({
                tipo: formTipo,
                monto: parseFloat(formMonto),
                concepto: formConcepto,
                categoria: categoriaFinal,
                notas: formNotas,
                reciboUrl,
                fechaHora: new Date(),
                creadoPor: $authStore.user?.uid,
            });

            // Notificación Push & Gmail al Administrador y equipo si es un Ingreso
            if (formTipo === 'Ingreso') {
                const adminEmail = $empresaStore?.email || $authStore.user?.email || 'admin@casalegal.bo';
                const creatorName = $authStore.profile?.name || $authStore.profile?.nombre || currentEmpleado?.nombre || 'Personal Legal';
                notificarNuevoIngresoFinanciero({
                    monto: parseFloat(formMonto),
                    concepto: formConcepto,
                    categoria: categoriaFinal,
                    registradoPorNombre: creatorName,
                    adminEmail: adminEmail
                }).catch(err => console.warn("Aviso ingreso:", err));
            }

            // Reset form
            formMonto = "";
            formConcepto = "";
            formNotas = "";
            formReciboFile = null;
            if (fileInputRef) fileInputRef.value = "";
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
    let editTipo = $state("");
    let editMonto = $state("");
    let editConcepto = $state("");
    let editCategoria = $state("");
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
                categoria: editCategoria,
            });
            editingTx = null;
            alert("Movimiento editado exitosamente");
        } catch (e) {
            console.error(e);
            alert("Error al actualizar");
        } finally {
            isSavingEdit = false;
        }
    }

    function canEditTx(trx) {
        // Solo permitir editar el último movimiento (el más reciente) subido por el creador
        const creadorTxs = transacciones.filter(
            (t) => t.creadoPor === trx.creadoPor,
        );
        const isLatest = creadorTxs.length > 0 && trx.id === creadorTxs[0].id;

        if (isAdministrador) {
            return isLatest; // El administrador también obedece la regla de inmutabilidad histórica
        }

        return trx.creadoPor === $authStore.user?.uid && isLatest;
    }

    // Reporte
    let isReportModalOpen = $state(false);
    let reportInicio = $state("");
    let reportFin = $state("");
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
        if (!reportInicio || !reportFin)
            return alert("Selecciona ambas fechas");
        isGeneratingReport = true;
        try {
            const iDate = new Date(reportInicio);
            iDate.setHours(0, 0, 0, 0);
            const fDate = new Date(reportFin);
            fDate.setHours(23, 59, 59, 999);

            const filterUid = isAdministrador
                ? filtroEmpleadoId
                : $authStore.user?.uid;
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
                    doc.text(
                        `Generado por: ${$authStore.profile?.name || "Usuario"}`,
                        30,
                        30,
                    );
                    doc.text(
                        `Rango: ${iDate.toLocaleDateString("es-BO")} al ${fDate.toLocaleDateString("es-BO")}`,
                        30,
                        36,
                    );
                    currentY = 46;
                } else {
                    doc.setFontSize(11);
                    doc.setTextColor(100, 100, 100);
                    doc.text(
                        `Generado por: ${$authStore.profile?.name || "Usuario"}`,
                        14,
                        30,
                    );
                    doc.text(
                        `Rango: ${iDate.toLocaleDateString("es-BO")} al ${fDate.toLocaleDateString("es-BO")}`,
                        14,
                        36,
                    );
                }
            } else {
                doc.setFontSize(11);
                doc.setTextColor(100, 100, 100);
                doc.text(
                    `Generado por: ${$authStore.profile?.name || "Usuario"}`,
                    14,
                    30,
                );
                doc.text(
                    `Rango: ${iDate.toLocaleDateString("es-BO")} al ${fDate.toLocaleDateString("es-BO")}`,
                    14,
                    36,
                );
            }

            let sumIng = 0;
            let sumEgr = 0;
            const tableData = txs.map((t) => {
                if (t.tipo === "Ingreso") sumIng += t.monto;
                if (t.tipo === "Egreso") sumEgr += t.monto;
                const d = t.fechaHora?.toDate
                    ? t.fechaHora.toDate()
                    : t.fechaHora
                      ? new Date(t.fechaHora)
                      : new Date();
                return [
                    d.toLocaleDateString("es-BO"),
                    t.tipo,
                    t.concepto,
                    t.categoria,
                    `${t.tipo === "Ingreso" ? "+" : "-"} Bs. ${t.monto.toLocaleString("es-BO")}`,
                ];
            });

            autoTable(doc, {
                startY: currentY,
                head: [["Fecha", "Tipo", "Concepto", "Categoría", "Monto"]],
                body: tableData,
                theme: "striped",
                headStyles: { fillColor: [15, 23, 42] },
                didParseCell: function (data) {
                    if (data.section === "body") {
                        const tipo = data.row.raw[1];
                        if (tipo === "Ingreso") {
                            if (
                                data.column.index === 1 ||
                                data.column.index === 4
                            ) {
                                data.cell.styles.textColor = [34, 197, 94];
                                data.cell.styles.fontStyle = "bold";
                            }
                        } else if (tipo === "Egreso") {
                            if (
                                data.column.index === 1 ||
                                data.column.index === 4
                            ) {
                                data.cell.styles.textColor = [239, 68, 68];
                                data.cell.styles.fontStyle = "bold";
                            }
                        }
                    }
                },
            });

            const finalY = doc.lastAutoTable?.finalY || currentY;
            doc.setFontSize(12);
            doc.setTextColor(20, 20, 20);
            doc.text(
                `Total Ingresos: Bs. ${sumIng.toLocaleString("es-BO")}`,
                14,
                finalY + 10,
            );
            doc.text(
                `Total Egresos: Bs. ${sumEgr.toLocaleString("es-BO")}`,
                14,
                finalY + 18,
            );

            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text(
                `Utilidad Neta: Bs. ${(sumIng - sumEgr).toLocaleString("es-BO")}`,
                14,
                finalY + 28,
            );

            doc.save(`Flujo_Efectivo_${Date.now()}.pdf`);
            isReportModalOpen = false;
        } catch (e) {
            console.error(e);
            alert("Error al generar reporte");
        } finally {
            isGeneratingReport = false;
        }
    }

    // Form State - Recurrente (Alquiler)
    let recConcepto = $state("");
    let recMonto = $state("");
    let recDiaCobro = $state("1");
    let recCliente = $state("");

    async function handleAddContrato(e) {
        e.preventDefault();
        if (!recConcepto || !recMonto || !recDiaCobro)
            return alert("Llenar campos obligatorios");

        isSubmitting = true;
        try {
            // 1. Guardar contrato recurrente
            await addContratoRecurrente({
                concepto: recConcepto,
                monto: parseFloat(recMonto),
                diaCobro: parseInt(recDiaCobro),
                cliente: recCliente,
                estado: "Activo",
                creadoPor: $authStore.user?.uid,
            });

            // 2. Programar el próximo evento en el Calendario Automáticamente!
            const hoy = new Date();
            let proximoMes = hoy.getMonth() + 1;
            let anio = hoy.getFullYear();
            if (proximoMes > 11) {
                proximoMes = 0;
                anio++;
            }

            const fechaCobro = new Date(
                anio,
                proximoMes,
                parseInt(recDiaCobro),
                9,
                0,
            ); // 9:00 AM

            await addEvento({
                titulo: `Cobro: ${recConcepto}`,
                tipo: "Cobro Alquiler",
                fechaHora: fechaCobro,
                asignadoA: "todos", // Todo el equipo se entera que hay que cobrar
                notas: `Monto: ${formatCurrency(parseFloat(recMonto))} | Cliente: ${recCliente}`,
                estado: "Pendiente",
                creadoPor: $authStore.user?.uid,
            });

            recConcepto = "";
            recMonto = "";
            recCliente = "";
            alert("Contrato creado y recordatorio añadido al calendario.");
        } catch (error) {
            console.error(error);
            alert("Error al guardar el contrato");
        } finally {
            isSubmitting = false;
        }
    }
</script>

<div class="p-4 md:p-lg max-w-[1440px] mx-auto w-full pb-24 md:pb-lg relative">
    <!-- Header Actions -->
    <div
        class="flex flex-col md:flex-row justify-between items-start md:items-end mb-xl gap-4"
    >
        <div>
            <div class="flex items-center gap-2">
                <h2
                    class="font-headline-xl text-headline-xl text-on-surface tracking-tight"
                >
                    Flujo de Efectivo
                </h2>
                {#if cajaMode === "abierta"}
                    <span
                        class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                    >
                        <span
                            class="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"
                        ></span>
                        Turno Abierto
                    </span>
                {:else}
                    <span
                        class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300"
                    >
                        Histórico Global
                    </span>
                {/if}
            </div>
            <p class="text-body-md text-on-surface-variant">
                Bóveda, Control financiero, arqueo y liquidación de caja.
            </p>
        </div>
        <div class="flex flex-wrap items-center gap-sm w-full md:w-auto">
            <button
                onclick={() => ($modoCelular = !$modoCelular)}
                class="w-full sm:w-auto bg-surface-container-high border border-outline-variant py-sm px-md rounded-xl font-bold flex items-center justify-center gap-xs hover:bg-surface-variant transition-colors text-label-md"
            >
                <span class="material-symbols-outlined"
                    >{$modoCelular ? "desktop_windows" : "smartphone"}</span
                >
                {$modoCelular ? "Salir Modo Celular" : "Modo Celular"}
            </button>

            {#if !$modoCelular}
                {#if isAdministrador}
                    <!-- Botón Cerrar Caja Exclusivo para Administrador General -->
                    <button
                        onclick={abrirModalCerrarCaja}
                        class="w-full sm:w-auto py-sm px-md rounded-xl font-bold bg-gradient-to-r from-[#006a39] to-[#004d28] text-[#ffe08e] hover:brightness-110 border border-[#c5a059]/60 shadow-lg shadow-[#006a39]/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                        title="Cerrar caja y liquidar balances de todos a cero"
                    >
                        <span
                            class="material-symbols-outlined text-[20px] text-[#ffe08e]"
                            >point_of_sale</span
                        >
                        <span>Cerrar Caja</span>
                    </button>
                {/if}

                <div
                    class="flex gap-xs w-full sm:w-auto bg-surface-container-high/60 p-1 rounded-xl border border-outline-variant"
                >
                    <button
                        onclick={() => (activeTab = "movimientos")}
                        class="py-1.5 px-3 rounded-lg font-bold text-label-sm {activeTab ===
                        'movimientos'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:bg-surface-container'} transition-all"
                    >
                        Caja
                    </button>
                    <button
                        onclick={() => (activeTab = "cierres")}
                        class="py-1.5 px-3 rounded-lg font-bold text-label-sm {activeTab ===
                        'cierres'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:bg-surface-container'} transition-all flex items-center gap-1"
                    >
                        <span class="material-symbols-outlined text-[15px]"
                            >inventory_2</span
                        >
                        <span>Cierres ({cierres.length})</span>
                    </button>
                    <button
                        onclick={() => (activeTab = "recurrentes")}
                        class="py-1.5 px-3 rounded-lg font-bold text-label-sm {activeTab ===
                        'recurrentes'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:bg-surface-container'} transition-all"
                    >
                        Alquileres
                    </button>
                </div>

                <button
                    onclick={() => (isReportModalOpen = true)}
                    class="w-full sm:w-auto py-sm px-md rounded-xl font-bold bg-surface-container border border-outline-variant text-on-surface-variant hover:bg-surface-variant transition-all flex items-center justify-center gap-2 text-label-md"
                >
                    <span class="material-symbols-outlined">picture_as_pdf</span
                    >
                    <span>Reporte</span>
                </button>
            {/if}
        </div>
    </div>

    {#if !$modoCelular}
        <div class="mb-md flex flex-wrap justify-between items-center gap-3">
            <!-- Switcher Modo Caja (Abierta vs Histórico) -->
            <div
                class="inline-flex rounded-lg border border-outline-variant p-0.5 bg-surface-container"
            >
                <button
                    onclick={() => (cajaMode = "abierta")}
                    class="px-3 py-1.5 rounded-md text-label-sm font-bold transition-all {cajaMode ===
                    'abierta'
                        ? 'bg-white text-primary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'}"
                >
                    Caja Activa (Turno)
                </button>
                <button
                    onclick={() => (cajaMode = "historico")}
                    class="px-3 py-1.5 rounded-md text-label-sm font-bold transition-all {cajaMode ===
                    'historico'
                        ? 'bg-white text-primary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'}"
                >
                    Histórico Acumulado
                </button>
            </div>

            {#if isAdministrador}
                <div class="flex items-center gap-2">
                    <span
                        class="text-label-sm text-on-surface-variant font-bold"
                        >Filtrar por:</span
                    >
                    <select
                        bind:value={filtroEmpleadoId}
                        class="bg-surface border border-outline-variant rounded-lg px-4 py-2 font-bold text-label-md shadow-sm outline-none focus:ring-1 focus:ring-primary"
                    >
                        <option value="todos">Vista General (Todos)</option>
                        {#each empleados as emp}
                            <option value={emp.authUid}
                                >{emp.nombre} {emp.apellidos}</option
                            >
                        {/each}
                    </select>
                </div>
            {/if}
        </div>
        <!-- Dashboard Overview (Bento Grid) -->
        <div class="grid grid-cols-12 gap-lg mb-2xl">
            <!-- Ingresos Total Card -->
            <div
                class="col-span-12 md:col-span-4 bg-white/80 backdrop-blur-md border border-outline-variant p-lg rounded-2xl shadow-sm relative overflow-hidden group"
            >
                <div
                    class="absolute top-0 right-0 p-lg opacity-10 group-hover:scale-110 transition-transform"
                >
                    <span
                        class="material-symbols-outlined text-[64px] text-primary"
                        >trending_up</span
                    >
                </div>
                <div class="flex items-center gap-sm text-primary mb-md">
                    <span class="material-symbols-outlined"
                        >account_balance</span
                    >
                    <span
                        class="font-bold text-label-sm uppercase tracking-wider"
                        >Ingresos Totales</span
                    >
                </div>
                <div class="font-display-lg text-display-lg text-on-surface">
                    {formatCurrency(totalIngresos)}
                </div>
            </div>

            <!-- Egresos Total Card -->
            <div
                class="col-span-12 md:col-span-4 bg-white/80 backdrop-blur-md border border-outline-variant p-lg rounded-2xl shadow-sm relative overflow-hidden group"
            >
                <div
                    class="absolute top-0 right-0 p-lg opacity-10 group-hover:scale-110 transition-transform"
                >
                    <span
                        class="material-symbols-outlined text-[64px] text-error"
                        >trending_down</span
                    >
                </div>
                <div class="flex items-center gap-sm text-error mb-md">
                    <span class="material-symbols-outlined">payments</span>
                    <span
                        class="font-bold text-label-sm uppercase tracking-wider"
                        >Egresos Totales</span
                    >
                </div>
                <div class="font-display-lg text-display-lg text-on-surface">
                    {formatCurrency(totalEgresos)}
                </div>
            </div>

            <!-- Net Profit Card -->
            <div
                class="col-span-12 md:col-span-4 {utilidadNeta >= 0
                    ? 'bg-primary'
                    : 'bg-error'} text-on-primary p-lg rounded-2xl shadow-xl relative overflow-hidden transition-colors"
            >
                <div class="relative z-10">
                    <div
                        class="flex items-center gap-sm text-primary-fixed mb-md"
                    >
                        <span class="material-symbols-outlined">savings</span>
                        <span
                            class="font-bold text-label-sm uppercase tracking-wider"
                            >Utilidad Neta</span
                        >
                    </div>
                    <div class="font-display-lg text-display-lg">
                        {formatCurrency(utilidadNeta)}
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Main Content Area Split -->
    <div
        class="grid grid-cols-1 {$modoCelular
            ? 'lg:grid-cols-1'
            : 'lg:grid-cols-12'} gap-xl w-full"
    >
        <!-- Left Column: Form (Mobile first view) -->
        <div
            class="{$modoCelular
                ? 'col-span-1 w-full max-w-[600px] mx-auto block'
                : 'col-span-1 lg:col-span-4'} order-first lg:order-last"
        >
            {#if activeTab === "movimientos"}
                <!-- Formulario Rápido de Gastos/Ingresos -->
                <div
                    class="bg-white rounded-2xl border border-outline-variant p-lg shadow-md w-full {$modoCelular
                        ? 'relative block'
                        : 'sticky top-24'}"
                >
                    <h4
                        class="font-bold text-headline-md mb-lg text-on-surface"
                    >
                        Registro Rápido
                    </h4>
                    <form onsubmit={handleAddMovimiento} class="space-y-md">
                        <!-- Selector de Tipo -->
                        <div
                            class="flex gap-2 p-1 bg-surface-container rounded-xl"
                        >
                            <button
                                type="button"
                                onclick={() => (formTipo = "Ingreso")}
                                class="flex-1 py-sm rounded-lg font-bold transition-all {formTipo ===
                                'Ingreso'
                                    ? 'bg-primary text-on-primary shadow-sm'
                                    : 'text-on-surface-variant hover:bg-surface-container-high'}"
                                >Ingreso</button
                            >
                            <button
                                type="button"
                                onclick={() => (formTipo = "Egreso")}
                                class="flex-1 py-sm rounded-lg font-bold transition-all {formTipo ===
                                'Egreso'
                                    ? 'bg-error text-on-error shadow-sm'
                                    : 'text-on-surface-variant hover:bg-surface-container-high'}"
                                >Gasto</button
                            >
                        </div>

                        <div>
                            <label
                                class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                >Monto (Bs.)</label
                            >
                            <input
                                bind:value={formMonto}
                                type="number"
                                step="0.01"
                                class="w-full bg-background border-none rounded-xl py-md px-md text-headline-md font-bold text-center focus:ring-2 focus:ring-primary/20 transition-all"
                                placeholder="0.00"
                                required
                            />
                        </div>

                        <div>
                            <label
                                class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                >Concepto</label
                            >
                            <input
                                bind:value={formConcepto}
                                type="text"
                                class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all placeholder:opacity-50"
                                placeholder="Ej. Garrafón de Agua"
                                required
                            />
                        </div>

                        <div>
                            <label
                                class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                >Categoría</label
                            >
                            <select
                                bind:value={formCategoria}
                                class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all"
                            >
                                {#if formTipo === "Ingreso"}
                                    <option value="Honorarios">Honorarios Profesionales</option>
                                    <option value="Capital">Capital (Aporte Admin a Empleados / Caja)</option>
                                    <option value="Trámites">Trámites y Gestiones</option>
                                    <option value="Consultas">Consultas Legales</option>
                                    <option value="Alquileres">Alquileres / Arriendos</option>
                                    <option value="Otro">Otro</option>
                                {:else}
                                    <option value="Procesos">Gastos de Procesos / Aranceles</option>
                                    <option value="Insumos de Oficina">Insumos de Oficina</option>
                                    <option value="Transporte / Pasajes">Transporte / Viáticos</option>
                                    <option value="Sueldos">Sueldos y Adelantos</option>
                                    <option value="Impuestos">Impuestos / Tasas</option>
                                    <option value="Otro">Otro</option>
                                {/if}
                            </select>
                            {#if formTipo === "Ingreso" && formCategoria === "Capital"}
                                <div class="mt-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                                    <span class="material-symbols-outlined text-[18px] text-amber-600 shrink-0">account_balance</span>
                                    <div>
                                        <strong class="font-bold">Aporte de Capital:</strong> Fondo otorgado por el Administrador para gastos operativos de empleados. Suma a la caja física pero se excluye de las ventas por honorarios en el Modo Jefe.
                                    </div>
                                </div>
                            {/if}
                            {#if formCategoria === "Otro"}
                                <input
                                    bind:value={customCategoria}
                                    type="text"
                                    placeholder="Escribe la categoría"
                                    class="w-full mt-2 bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all"
                                    required
                                />
                            {/if}
                        </div>

                        <!-- File Upload -->
                        <div>
                            <label
                                class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                >Recibo / Factura (Foto)</label
                            >
                            <input
                                bind:this={fileInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                class="hidden"
                                onchange={(e) =>
                                    (formReciboFile = e.target.files[0])}
                            />
                            <button
                                type="button"
                                onclick={() => fileInputRef.click()}
                                class="w-full flex items-center justify-center gap-sm bg-surface-container-high border border-outline-variant border-dashed text-on-surface-variant py-md rounded-xl hover:bg-surface-variant transition-colors font-bold"
                            >
                                {#if formReciboFile}
                                    <span
                                        class="material-symbols-outlined text-primary"
                                        >check_circle</span
                                    >
                                    <span class="text-primary truncate"
                                        >{formReciboFile.name}</span
                                    >
                                {:else}
                                    <span class="material-symbols-outlined"
                                        >add_a_photo</span
                                    >
                                    <span>Tomar Foto / Subir Archivo</span>
                                {/if}
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            class="w-full bg-secondary text-on-secondary font-bold text-label-lg py-md rounded-xl shadow-md active:scale-[0.98] transition-all flex justify-center items-center gap-xs"
                        >
                            {#if isSubmitting}
                                <span
                                    class="material-symbols-outlined animate-spin"
                                    >progress_activity</span
                                > Guardando...
                            {:else}
                                <span class="material-symbols-outlined"
                                    >save</span
                                > Guardar Transacción
                            {/if}
                        </button>
                    </form>
                </div>
            {:else}
                <!-- Formulario Recurrentes (Inmobiliaria) -->
                <div
                    class="bg-white rounded-2xl border border-outline-variant p-lg shadow-md w-full {$modoCelular
                        ? 'relative block'
                        : 'sticky top-24'}"
                >
                    <h4
                        class="font-bold text-headline-md mb-lg text-on-surface"
                    >
                        Nuevo Alquiler / Fijo
                    </h4>
                    <form onsubmit={handleAddContrato} class="space-y-md">
                        <div>
                            <label
                                class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                >Concepto del Cobro</label
                            >
                            <input
                                bind:value={recConcepto}
                                type="text"
                                class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all placeholder:opacity-50"
                                placeholder="Ej. Alquiler Dpto 402"
                                required
                            />
                        </div>

                        <div class="grid grid-cols-2 gap-md">
                            <div>
                                <label
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >Monto Mensual</label
                                >
                                <input
                                    bind:value={recMonto}
                                    type="number"
                                    step="0.01"
                                    class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all"
                                    placeholder="1000"
                                    required
                                />
                            </div>
                            <div>
                                <label
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >Día de Cobro</label
                                >
                                <input
                                    bind:value={recDiaCobro}
                                    type="number"
                                    min="1"
                                    max="31"
                                    class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all"
                                    placeholder="Ej. 15"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label
                                class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                >Inquilino / Cliente</label
                            >
                            <input
                                bind:value={recCliente}
                                type="text"
                                class="w-full bg-background border-none rounded-xl py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20 transition-all placeholder:opacity-50"
                                placeholder="Nombre de quien paga"
                                required
                            />
                        </div>

                        <div
                            class="p-sm bg-primary/10 rounded-lg text-label-sm text-primary-fixed-variant flex items-start gap-sm"
                        >
                            <span class="material-symbols-outlined text-[16px]"
                                >info</span
                            >
                            <p>
                                Se creará automáticamente un evento recordatorio
                                en el calendario cada mes para este cobro.
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            class="w-full bg-secondary text-on-secondary font-bold text-label-lg py-md rounded-xl shadow-md active:scale-[0.98] transition-all flex justify-center items-center gap-xs"
                        >
                            {#if isSubmitting}
                                <span
                                    class="material-symbols-outlined animate-spin"
                                    >progress_activity</span
                                > Programando...
                            {:else}
                                <span class="material-symbols-outlined"
                                    >calendar_add_on</span
                                > Crear Cobro Recurrente
                            {/if}
                        </button>
                    </form>
                </div>
            {/if}
        </div>

        {#if !$modoCelular}
            <!-- Right Column: Historial / Data -->
            <div class="col-span-1 lg:col-span-8 order-last lg:order-first">
                {#if activeTab === "movimientos"}
                    <div
                        class="bg-white rounded-2xl border border-outline-variant overflow-hidden shadow-sm"
                    >
                        <div
                            class="p-lg border-b border-outline-variant flex justify-between items-center bg-surface-container-low"
                        >
                            <h3 class="font-bold text-headline-md">
                                Historial de Movimientos (Recientes)
                            </h3>
                        </div>

                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr
                                        class="bg-surface-container-low border-b border-outline-variant"
                                    >
                                        <th
                                            class="px-lg py-md font-bold text-label-md text-on-surface-variant uppercase tracking-wider"
                                            >Fecha</th
                                        >
                                        <th
                                            class="px-lg py-md font-bold text-label-md text-on-surface-variant uppercase tracking-wider"
                                            >Concepto</th
                                        >
                                        <th
                                            class="px-lg py-md font-bold text-label-md text-on-surface-variant uppercase tracking-wider"
                                            >Categoría</th
                                        >
                                        <th
                                            class="px-lg py-md font-bold text-label-md text-on-surface-variant uppercase tracking-wider"
                                            >Monto</th
                                        >
                                        <th
                                            class="px-lg py-md font-bold text-label-md text-on-surface-variant uppercase tracking-wider"
                                            >Comprobante</th
                                        >
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-outline-variant">
                                    {#if loading}
                                        <tr
                                            ><td
                                                colspan="5"
                                                class="text-center p-xl"
                                                ><span
                                                    class="material-symbols-outlined animate-spin text-primary text-[32px]"
                                                    >progress_activity</span
                                                ></td
                                            ></tr
                                        >
                                    {:else if transaccionesPermitidas.length === 0}
                                        <tr
                                            ><td
                                                colspan="5"
                                                class="text-center p-xl text-on-surface-variant"
                                                >No hay movimientos registrados.</td
                                            ></tr
                                        >
                                    {:else}
                                        {#each transaccionesPermitidas as trx}
                                            {@const trxDate = trx.fechaHora
                                                .toDate
                                                ? trx.fechaHora.toDate()
                                                : new Date(trx.fechaHora)}
                                            <tr
                                                class="hover:bg-surface-container-highest/10 transition-colors"
                                            >
                                                <td
                                                    class="px-lg py-md whitespace-nowrap text-label-md text-on-surface-variant"
                                                >
                                                    {trxDate.toLocaleDateString(
                                                        "es-BO",
                                                    )} <br />
                                                    <span
                                                        class="text-[11px] opacity-70"
                                                        >{trxDate.toLocaleTimeString(
                                                            "es-BO",
                                                            {
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                            },
                                                        )}</span
                                                    >
                                                </td>
                                                <td
                                                    class="px-lg py-md font-bold text-on-surface"
                                                >
                                                    {trx.concepto}
                                                    {#if isAdministrador && trx.creadoPor !== $authStore.user?.uid}
                                                        {@const creador =
                                                            empleados.find(
                                                                (e) =>
                                                                    e.authUid ===
                                                                    trx.creadoPor,
                                                            )}
                                                        <div
                                                            class="text-[10px] text-on-surface-variant/60 uppercase mt-1 flex items-center gap-1"
                                                        >
                                                            <span
                                                                class="material-symbols-outlined text-[12px]"
                                                                >person</span
                                                            >
                                                            {creador
                                                                ? creador.nombre
                                                                : "Empleado"}
                                                        </div>
                                                    {/if}
                                                </td>
                                                <td
                                                    class="px-lg py-md text-label-sm text-on-surface-variant"
                                                >
                                                    <span
                                                        class="bg-surface-container px-2 py-1 rounded-full border border-outline-variant/30"
                                                        >{trx.categoria}</span
                                                    >
                                                </td>
                                                <td
                                                    class="px-lg py-md font-bold {trx.tipo ===
                                                    'Ingreso'
                                                        ? 'text-primary'
                                                        : 'text-error'}"
                                                >
                                                    {trx.tipo === "Ingreso"
                                                        ? "+"
                                                        : "-"}{formatCurrency(
                                                        trx.monto,
                                                    )}
                                                </td>
                                                <td
                                                    class="px-lg py-md text-center flex items-center gap-2"
                                                >
                                                    {#if trx.reciboUrl}
                                                        <a
                                                            href={trx.reciboUrl}
                                                            target="_blank"
                                                            class="p-2 bg-surface-container-high rounded-full inline-flex text-primary hover:bg-primary-container transition-colors"
                                                            title="Ver Comprobante"
                                                        >
                                                            <span
                                                                class="material-symbols-outlined text-[18px]"
                                                                >receipt_long</span
                                                            >
                                                        </a>
                                                    {/if}
                                                    {#if canEditTx(trx)}
                                                        <button
                                                            onclick={() =>
                                                                openEditTx(trx)}
                                                            class="p-2 bg-surface-container-high rounded-full inline-flex text-secondary hover:bg-secondary-container transition-colors"
                                                            title="Editar"
                                                        >
                                                            <span
                                                                class="material-symbols-outlined text-[18px]"
                                                                >edit</span
                                                            >
                                                        </button>
                                                    {:else}
                                                        <button
                                                            disabled
                                                            class="p-2 bg-surface-container-low rounded-full inline-flex text-outline opacity-50 cursor-not-allowed"
                                                            title="Solo puedes editar tu último movimiento registrado"
                                                        >
                                                            <span
                                                                class="material-symbols-outlined text-[18px]"
                                                                >edit_off</span
                                                            >
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
                            <div
                                class="p-md flex justify-center border-t border-outline-variant bg-surface-container-lowest"
                            >
                                <button
                                    onclick={loadMore}
                                    class="bg-surface-container-high hover:bg-surface-variant text-on-surface py-2 px-6 rounded-full font-bold transition-colors shadow-sm"
                                >
                                    Cargar más movimientos
                                </button>
                            </div>
                        {/if}
                    </div>
                {:else if activeTab === "cierres"}
                    <!-- Historial de Cierres de Caja -->
                    <div
                        class="bg-white rounded-2xl border border-outline-variant overflow-hidden shadow-sm"
                    >
                        <div
                            class="p-lg border-b border-outline-variant flex flex-col sm:flex-row justify-between items-start sm:items-center bg-surface-container-low gap-3"
                        >
                            <div>
                                <h3
                                    class="font-bold text-headline-md flex items-center gap-2"
                                >
                                    <span
                                        class="material-symbols-outlined text-primary"
                                        >inventory_2</span
                                    >
                                    Historial de Cierres de Caja
                                </h3>
                                <p
                                    class="text-label-sm text-on-surface-variant"
                                >
                                    Actas oficiales y auditoría inmutable de
                                    arqueos realizados.
                                </p>
                            </div>
                            {#if isAdministrador}
                                <button
                                    onclick={abrirModalCerrarCaja}
                                    class="px-4 py-2 rounded-xl font-bold bg-[#006a39] text-[#ffe08e] hover:bg-[#004d28] border border-[#c5a059] flex items-center gap-1.5 shadow-sm text-label-md"
                                >
                                    <span
                                        class="material-symbols-outlined text-[18px]"
                                        >add_circle</span
                                    >
                                    Nuevo Cierre
                                </button>
                            {/if}
                        </div>

                        <div class="p-md space-y-3">
                            {#if cierres.length === 0}
                                <div class="text-center py-12 px-4">
                                    <span
                                        class="material-symbols-outlined text-[48px] text-outline/50 mb-2 block"
                                        >receipt_long</span
                                    >
                                    <h4
                                        class="font-bold text-body-lg text-on-surface"
                                    >
                                        No se han registrado cierres de caja
                                        todavía
                                    </h4>
                                    <p
                                        class="text-label-sm text-on-surface-variant mt-1 max-w-[420px] mx-auto"
                                    >
                                        Al ejecutar un Cierre de Caja como
                                        Administrador General, las cuentas
                                        activas quedarán en Bs. 0.00 y se
                                        archivará aquí el acta oficial con valor
                                        contable.
                                    </p>
                                </div>
                            {:else}
                                <div class="grid grid-cols-1 gap-3">
                                    {#each cierres as cierre}
                                        {@const fechaC = cierre.fechaHora
                                            ?.toDate
                                            ? cierre.fechaHora.toDate()
                                            : cierre.fechaHora
                                              ? new Date(cierre.fechaHora)
                                              : new Date()}
                                        <div
                                            class="border border-outline-variant/80 rounded-xl p-4 bg-surface hover:border-primary/50 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xs"
                                        >
                                            <div class="space-y-1">
                                                <div
                                                    class="flex items-center gap-2"
                                                >
                                                    <span
                                                        class="font-mono font-bold text-label-md px-2.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                                                    >
                                                        {cierre.folio ||
                                                            "CORTE-001"}
                                                    </span>
                                                    <span
                                                        class="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                                                    >
                                                        LIQUIDADO (0.00)
                                                    </span>
                                                </div>
                                                <div
                                                    class="text-label-sm text-on-surface-variant flex items-center gap-2"
                                                >
                                                    <span
                                                        >{fechaC.toLocaleDateString(
                                                            "es-BO",
                                                        )} - {fechaC.toLocaleTimeString(
                                                            "es-BO",
                                                            {
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                            },
                                                        )}</span
                                                    >
                                                    <span>•</span>
                                                    <span
                                                        >Por: <strong
                                                            class="text-on-surface"
                                                            >{cierre.cerradoPorNombre ||
                                                                "Admin"}</strong
                                                        ></span
                                                    >
                                                </div>
                                                <div
                                                    class="text-xs text-on-surface-variant/80 italic line-clamp-1"
                                                >
                                                    "{cierre.observaciones ||
                                                        "Sin observaciones"}"
                                                </div>
                                            </div>

                                            <div
                                                class="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end"
                                            >
                                                <div class="text-right">
                                                    <div
                                                        class="text-[10px] uppercase font-bold text-on-surface-variant"
                                                    >
                                                        Saldo Arqueado
                                                    </div>
                                                    <div
                                                        class="font-bold text-headline-sm text-primary"
                                                    >
                                                        {formatCurrency(
                                                            cierre.saldoNeto ||
                                                                0,
                                                        )}
                                                    </div>
                                                    <div
                                                        class="text-[11px] text-on-surface-variant"
                                                    >
                                                        Recaudado: {formatCurrency(
                                                            cierre.totalIngresos ||
                                                                0,
                                                        )}
                                                    </div>
                                                </div>

                                                <div
                                                    class="flex items-center gap-2"
                                                >
                                                    <button
                                                        onclick={() =>
                                                            abrirDetalleCierre(
                                                                cierre,
                                                            )}
                                                        class="p-2.5 rounded-lg border border-outline-variant hover:bg-surface-container text-on-surface transition-colors"
                                                        title="Ver Acta Completa"
                                                    >
                                                        <span
                                                            class="material-symbols-outlined text-[20px]"
                                                            >visibility</span
                                                        >
                                                    </button>
                                                    <button
                                                        onclick={() =>
                                                            handleDescargarPdfCierre(
                                                                cierre,
                                                            )}
                                                        class="p-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                                        title="Descargar Acta en PDF"
                                                    >
                                                        <span
                                                            class="material-symbols-outlined text-[20px]"
                                                            >picture_as_pdf</span
                                                        >
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <div
                        class="bg-white rounded-2xl border border-outline-variant overflow-hidden shadow-sm"
                    >
                        <div
                            class="p-lg border-b border-outline-variant flex justify-between items-center bg-surface-container-low"
                        >
                            <h3 class="font-bold text-headline-md">
                                Alquileres y Cobros Activos
                            </h3>
                        </div>

                        <div
                            class="grid grid-cols-1 md:grid-cols-2 gap-md p-md"
                        >
                            {#if contratos.length === 0}
                                <div
                                    class="col-span-full text-center p-xl text-on-surface-variant"
                                >
                                    No hay cobros recurrentes registrados.
                                </div>
                            {:else}
                                {#each contratos as contrato}
                                    {@const diaHoy = new Date().getDate()}
                                    {@const estado =
                                        contrato.diaCobro < diaHoy
                                            ? "VENCIDO"
                                            : "PRÓXIMO"}
                                    <div
                                        class="bg-surface border {estado ===
                                        'VENCIDO'
                                            ? 'border-error/50 bg-error/5'
                                            : 'border-outline-variant'} p-md rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group"
                                    >
                                        {#if estado === "VENCIDO"}
                                            <div
                                                class="absolute top-0 left-0 w-1 h-full bg-error"
                                            ></div>
                                        {/if}
                                        <div>
                                            <div
                                                class="flex justify-between items-start mb-sm"
                                            >
                                                <h4
                                                    class="font-bold text-body-lg text-on-surface"
                                                >
                                                    {contrato.concepto}
                                                </h4>
                                                <span
                                                    class="bg-surface-container text-on-surface-variant px-2 py-1 rounded text-label-sm font-bold flex items-center gap-1"
                                                >
                                                    <span
                                                        class="material-symbols-outlined text-[14px]"
                                                        >event</span
                                                    >
                                                    Día {contrato.diaCobro}
                                                </span>
                                            </div>
                                            <p
                                                class="text-label-md text-on-surface-variant mb-xs"
                                            >
                                                <span class="font-bold"
                                                    >Cliente:</span
                                                >
                                                {contrato.cliente}
                                            </p>
                                        </div>
                                        <div
                                            class="mt-md pt-sm border-t border-outline-variant/30 flex justify-between items-center"
                                        >
                                            <span
                                                class="font-bold text-headline-md text-primary"
                                                >{formatCurrency(
                                                    contrato.monto,
                                                )}</span
                                            >
                                            <span
                                                class="px-2 py-1 rounded-full text-[10px] font-bold uppercase {estado ===
                                                'VENCIDO'
                                                    ? 'bg-error-container text-on-error-container'
                                                    : 'bg-secondary-container text-on-secondary-container'}"
                                            >
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
    <div
        class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
        <div
            class="bg-surface rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden flex flex-col"
        >
            <div
                class="p-lg border-b border-outline-variant bg-surface-container-lowest flex justify-between items-center shrink-0"
            >
                <h3 class="font-bold text-headline-sm text-on-surface">
                    Editar Movimiento
                </h3>
                <button
                    onclick={() => (editingTx = null)}
                    class="p-2 hover:bg-surface-container rounded-full text-outline transition-colors"
                >
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="p-lg flex flex-col gap-4">
                <div class="flex gap-2 p-1 bg-surface-container rounded-xl">
                    <button
                        type="button"
                        onclick={() => (editTipo = "Ingreso")}
                        class="flex-1 py-sm rounded-lg font-bold transition-all {editTipo ===
                        'Ingreso'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:bg-surface-container-high'}"
                        >Ingreso</button
                    >
                    <button
                        type="button"
                        onclick={() => (editTipo = "Egreso")}
                        class="flex-1 py-sm rounded-lg font-bold transition-all {editTipo ===
                        'Egreso'
                            ? 'bg-error text-on-error shadow-sm'
                            : 'text-on-surface-variant hover:bg-surface-container-high'}"
                        >Gasto</button
                    >
                </div>
                <div>
                    <label
                        class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                        >Monto (Bs.)</label
                    >
                    <input
                        bind:value={editMonto}
                        type="number"
                        step="0.01"
                        class="w-full bg-surface-container-low border border-outline-variant rounded-xl py-sm px-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
                <div>
                    <label
                        class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                        >Concepto</label
                    >
                    <input
                        bind:value={editConcepto}
                        type="text"
                        class="w-full bg-surface-container-low border border-outline-variant rounded-xl py-sm px-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
                <div>
                    <label
                        class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                        >Categoría</label
                    >
                    <input
                        bind:value={editCategoria}
                        type="text"
                        class="w-full bg-surface-container-low border border-outline-variant rounded-xl py-sm px-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
            </div>
            <div
                class="p-lg border-t border-outline-variant bg-surface-container-lowest flex justify-end gap-3 shrink-0"
            >
                <button
                    onclick={() => (editingTx = null)}
                    class="px-6 py-2 rounded-xl font-bold text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
                    >Cancelar</button
                >
                <button
                    onclick={saveEditTx}
                    disabled={isSavingEdit}
                    class="px-6 py-2 rounded-xl font-bold text-label-md bg-primary text-on-primary hover:opacity-90 transition-opacity"
                >
                    {#if isSavingEdit}
                        Guardando...
                    {:else}
                        Guardar Cambios
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Modal Reporte -->
{#if isReportModalOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
        <div
            class="bg-surface rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden flex flex-col"
        >
            <div
                class="p-lg border-b border-outline-variant bg-surface-container-lowest flex justify-between items-center shrink-0"
            >
                <h3 class="font-bold text-headline-sm text-on-surface">
                    Generar Reporte
                </h3>
                <button
                    onclick={() => (isReportModalOpen = false)}
                    class="p-2 hover:bg-surface-container rounded-full text-outline transition-colors"
                >
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="p-lg flex flex-col gap-4">
                <p class="text-body-sm text-on-surface-variant">
                    Selecciona el rango de fechas para generar el PDF con el
                    resumen de movimientos y totales.
                </p>
                <div>
                    <label
                        class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                        >Desde</label
                    >
                    <input
                        bind:value={reportInicio}
                        type="date"
                        class="w-full bg-surface-container-low border border-outline-variant rounded-xl py-sm px-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
                <div>
                    <label
                        class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                        >Hasta</label
                    >
                    <input
                        bind:value={reportFin}
                        type="date"
                        class="w-full bg-surface-container-low border border-outline-variant rounded-xl py-sm px-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
            </div>
            <div
                class="p-lg border-t border-outline-variant bg-surface-container-lowest flex justify-end gap-3 shrink-0"
            >
                <button
                    onclick={() => (isReportModalOpen = false)}
                    class="px-6 py-2 rounded-xl font-bold text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
                    >Cancelar</button
                >
                <button
                    onclick={handleGenerateReport}
                    disabled={isGeneratingReport}
                    class="px-6 py-2 rounded-xl font-bold text-label-md bg-secondary text-on-secondary hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                    {#if isGeneratingReport}
                        <span
                            class="material-symbols-outlined animate-spin text-[18px]"
                            >progress_activity</span
                        > Generando...
                    {:else}
                        <span class="material-symbols-outlined text-[18px]"
                            >picture_as_pdf</span
                        > Descargar PDF
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Modal Cierre de Caja General (Pre-Arqueo y Puesta a Ceros) -->
{#if isCerrarCajaModalOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
        <div class="bg-surface rounded-3xl w-full max-w-4xl shadow-2xl border border-outline-variant overflow-hidden flex flex-col max-h-[92vh]">
            
            <!-- Modal Header -->
            <div class="px-6 py-5 border-b border-outline-variant bg-surface-container-low flex justify-between items-start shrink-0">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-primary text-on-primary">
                            Auditoría de Administración General
                        </span>
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-700 border border-amber-300">
                            Corte Oficial
                        </span>
                    </div>
                    <h3 class="font-bold text-headline-md text-on-surface">
                        Cierre de Caja y Balance a Bs. 0.00
                    </h3>
                    <p class="text-xs text-on-surface-variant mt-0.5">
                        Indica el día, fecha y hora exacta del corte. Todas las cuentas de los empleados quedarán en ceros y se archivarán los trámites finalizados.
                    </p>
                </div>
                <button
                    onclick={() => isCerrarCajaModalOpen = false}
                    class="p-2 hover:bg-surface-container rounded-full text-on-surface-variant hover:text-on-surface transition-colors"
                    title="Cerrar ventana"
                >
                    <span class="material-symbols-outlined text-[22px]">close</span>
                </button>
            </div>

            <!-- Modal Body (Scrollable) -->
            <div class="p-6 overflow-y-auto space-y-6 flex-1">
                
                <!-- 1. Configuración de Día, Fecha y Hora del Corte -->
                <div class="bg-surface-container-lowest border border-primary/20 rounded-2xl p-5 shadow-sm space-y-4">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[18px]">event_available</span>
                            1. Fecha y Hora de Corte para el Cierre
                        </span>
                        <button 
                            type="button"
                            onclick={recalcularArqueo}
                            class="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                            title="Recalcular arqueo según la fecha/hora elegida"
                        >
                            <span class="material-symbols-outlined text-[16px] {cargandoArqueo ? 'animate-spin' : ''}">refresh</span>
                            Recalcular con esta fecha
                        </button>
                    </div>

                    <!-- Indicador visual del día seleccionado -->
                    <div class="p-3 bg-primary/5 rounded-xl border border-primary/15 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center font-bold">
                                <span class="material-symbols-outlined text-[22px]">today</span>
                            </div>
                            <div>
                                <div class="text-[11px] text-on-surface-variant font-medium">Día seleccionado para el corte:</div>
                                <div class="text-sm font-bold text-on-surface capitalize">
                                    {getNombreDiaSemana(fechaCorteCierre) || "Hoy"}
                                </div>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="text-[11px] text-on-surface-variant block">Hora de corte:</span>
                            <span class="font-mono font-bold text-sm text-primary">{horaCorteCierre}</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1.5">
                                Fecha de Corte
                            </label>
                            <input
                                type="date"
                                bind:value={fechaCorteCierre}
                                onchange={recalcularArqueo}
                                class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                            />
                        </div>
                        <div>
                            <label class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1.5">
                                Hora de Corte
                            </label>
                            <input
                                type="time"
                                bind:value={horaCorteCierre}
                                onchange={recalcularArqueo}
                                class="w-full bg-surface border border-outline-variant rounded-xl py-2 px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                            />
                        </div>
                    </div>
                </div>

                <!-- 2. Resumen Numérico del Arqueo Previo -->
                <div>
                    <h4 class="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3 flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[18px]">query_stats</span>
                        2. Arqueo Financiero del Periodo a Liquidar
                    </h4>

                    {#if cargandoArqueo}
                        <div class="p-8 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant">
                            <span class="material-symbols-outlined animate-spin text-[32px] text-primary mb-2">progress_activity</span>
                            <p class="text-sm text-on-surface-variant font-medium">Calculando arqueo exacto...</p>
                        </div>
                    {:else if arqueoPrevio}
                        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
                            <div class="bg-surface-container-lowest border border-outline-variant p-3.5 rounded-xl">
                                <div class="text-[10px] uppercase font-bold text-on-surface-variant">Honorarios / Ventas</div>
                                <div class="text-body-lg font-bold text-emerald-600 mt-1">
                                    {formatCurrency(arqueoPrevio.ingresosVentas || 0)}
                                </div>
                                <div class="text-[10px] text-on-surface-variant/80 mt-0.5">Servicios comerciales</div>
                            </div>

                            <div class="bg-surface-container-lowest border border-outline-variant p-3.5 rounded-xl">
                                <div class="text-[10px] uppercase font-bold text-amber-700">Capital Admin</div>
                                <div class="text-body-lg font-bold text-amber-600 mt-1">
                                    {formatCurrency(arqueoPrevio.ingresosCapital || 0)}
                                </div>
                                <div class="text-[10px] text-on-surface-variant/80 mt-0.5">Fondo operativo</div>
                            </div>

                            <div class="bg-surface-container-lowest border border-outline-variant p-3.5 rounded-xl">
                                <div class="text-[10px] uppercase font-bold text-on-surface-variant">Total Recaudado</div>
                                <div class="text-body-lg font-bold text-on-surface mt-1">
                                    {formatCurrency(arqueoPrevio.totalIngresos || 0)}
                                </div>
                                <div class="text-[10px] text-on-surface-variant/80 mt-0.5">{arqueoPrevio.totalOperaciones || 0} movimientos</div>
                            </div>

                            <div class="bg-surface-container-lowest border border-outline-variant p-3.5 rounded-xl">
                                <div class="text-[10px] uppercase font-bold text-error">Gastos / Egresos</div>
                                <div class="text-body-lg font-bold text-error mt-1">
                                    {formatCurrency(arqueoPrevio.totalEgresos || 0)}
                                </div>
                                <div class="text-[10px] text-on-surface-variant/80 mt-0.5">Egresos liquidados</div>
                            </div>

                            <div class="col-span-2 lg:col-span-1 bg-primary text-on-primary p-3.5 rounded-xl shadow-md">
                                <div class="text-[10px] uppercase font-bold text-white/80">Saldo en Caja</div>
                                <div class="text-body-lg font-bold text-white mt-1">
                                    {formatCurrency(arqueoPrevio.saldoNeto || 0)}
                                </div>
                                <div class="text-[10px] text-white/80 mt-0.5">Saldo final a liquidar</div>
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- 3. Cuentas de Personal y Abogados: Se restablecen a Bs. 0.00 -->
                <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[18px]">group</span>
                            3. Cuentas del Personal Legal (Quedarán en Bs. 0.00)
                        </span>
                        <span class="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">check_circle</span>
                            Puesta a Cero Garantizada
                        </span>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs">
                            <thead class="border-b border-outline-variant bg-surface-container-low text-on-surface-variant">
                                <tr>
                                    <th class="p-2.5 font-bold">Personal / Abogado</th>
                                    <th class="p-2.5 font-bold text-right">Ventas</th>
                                    <th class="p-2.5 font-bold text-right">Capital</th>
                                    <th class="p-2.5 font-bold text-right">Gastos</th>
                                    <th class="p-2.5 font-bold text-right">Balance Previo</th>
                                    <th class="p-2.5 font-bold text-center">Nuevo Balance</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-outline-variant/60">
                                {#if arqueoPrevio?.desglosePorEmpleado && arqueoPrevio.desglosePorEmpleado.length > 0}
                                    {#each arqueoPrevio.desglosePorEmpleado as emp}
                                        <tr class="hover:bg-surface-container/50">
                                            <td class="p-2.5 font-bold text-on-surface">{emp.nombre}</td>
                                            <td class="p-2.5 text-right font-mono text-emerald-600">{formatCurrency(emp.ingresosVentas || 0)}</td>
                                            <td class="p-2.5 text-right font-mono text-amber-600">{formatCurrency(emp.ingresosCapital || 0)}</td>
                                            <td class="p-2.5 text-right font-mono text-error">{formatCurrency(emp.egresos || 0)}</td>
                                            <td class="p-2.5 text-right font-mono font-bold">{formatCurrency(emp.balance || 0)}</td>
                                            <td class="p-2.5 text-center">
                                                <span class="px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                    Bs. 0.00
                                                </span>
                                            </td>
                                        </tr>
                                    {/each}
                                {:else}
                                    <tr>
                                        <td colspan="6" class="p-4 text-center text-on-surface-variant italic">
                                            No hay operaciones abiertas para liquidar en este periodo.
                                        </td>
                                    </tr>
                                {/if}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- 4. Trámites Finalizados a Archivar en el Historial -->
                <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[18px]">archive</span>
                            4. Trámites y Casos Finalizados a Archivar ({casosPorArchivar.length})
                        </span>
                        <span class="text-[11px] text-on-surface-variant">
                            Mover al Historial de Trámites
                        </span>
                    </div>

                    {#if casosPorArchivar.length === 0}
                        <div class="p-3 bg-surface-container-low rounded-xl text-xs text-on-surface-variant text-center">
                            No hay casos con estado "Finalizado" pendientes de archivar hasta la fecha seleccionada.
                        </div>
                    {:else}
                        <div class="p-3 bg-surface-container-low rounded-xl space-y-2">
                            <p class="text-xs text-on-surface-variant">
                                Se eliminarán del tablero activo de casos y se transferirán al <strong>Historial de Trámites</strong> los siguientes {casosPorArchivar.length} casos:
                            </p>
                            <div class="max-h-36 overflow-y-auto space-y-1.5">
                                {#each casosPorArchivar as caso}
                                    <div class="flex items-center justify-between text-xs p-2 bg-white rounded-lg border border-outline-variant/60">
                                        <div>
                                            <strong class="text-on-surface">{caso.numeroTramite || caso.id?.slice(0, 8)}</strong>
                                            <span class="text-on-surface-variant ml-1.5">{caso.titulo}</span>
                                            <span class="text-[10px] text-on-surface-variant/70 ml-1">({caso.clienteNombre || "Cliente"})</span>
                                        </div>
                                        <div class="font-mono text-primary font-bold">
                                            {formatCurrency(caso.montoAcordado || 0)}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- 5. Observaciones del Cierre -->
                <div>
                    <label class="block text-xs font-bold text-on-surface-variant uppercase mb-1.5">
                        5. Observaciones del Cierre de Caja
                    </label>
                    <textarea
                        bind:value={observacionesCierre}
                        rows="2"
                        placeholder="Ej. Arqueo de fin de semana realizado conforme. Fondo de caja física cuadrando con comprobantes."
                        class="w-full bg-surface-container-lowest border border-outline-variant rounded-xl p-3 text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    ></textarea>
                </div>

                <!-- Alerta Legal y de Auditoría -->
                <div class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                    <span class="material-symbols-outlined text-[20px] text-amber-600 shrink-0">warning</span>
                    <div class="text-[11px] leading-relaxed">
                        <strong>Atención Auditoría:</strong> Al confirmar, las operaciones abiertas hasta el corte quedarán oficialmente liquidadas, las cuentas de los miembros del equipo se reiniciarán a <strong>Bs. 0.00</strong> y se generará el acta formal inmutable.
                    </div>
                </div>

            </div>

            <!-- Modal Footer -->
            <div class="p-5 border-t border-outline-variant bg-surface-container-low flex justify-end gap-3 shrink-0">
                <button
                    type="button"
                    onclick={() => isCerrarCajaModalOpen = false}
                    disabled={isCerrandoCaja}
                    class="px-5 py-2.5 rounded-xl font-bold text-xs text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onclick={handleConfirmarCierreCaja}
                    disabled={isCerrandoCaja}
                    class="px-6 py-2.5 rounded-xl font-bold text-xs bg-primary text-on-primary hover:opacity-90 transition-all shadow-md flex items-center gap-2"
                >
                    {#if isCerrandoCaja}
                        <span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                        Liquidando y Poniendo Cuentas a Cero...
                    {:else}
                        <span class="material-symbols-outlined text-[18px]">verified</span>
                        Confirmar Cierre y Poner Cuentas a Bs. 0.00
                    {/if}
                </button>
            </div>

        </div>
    </div>
{/if}

<!-- Modal Informe Oficial de Cierre de Caja -->
{#if isInformeCierreModalOpen && cierreSeleccionado}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
        <div class="bg-surface rounded-3xl w-full max-w-4xl shadow-2xl border border-outline-variant overflow-hidden flex flex-col max-h-[92vh]">
            
            <!-- Header Informe -->
            <div class="px-6 py-5 border-b border-outline-variant bg-emerald-950 text-white flex justify-between items-start shrink-0">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#c5a059] text-[#0c1a14] uppercase">
                            {cierreSeleccionado.folio || "CORTE-OFICIAL"}
                        </span>
                        <span class="text-xs text-emerald-200">
                            Estado: Liquidado y Cerrado
                        </span>
                    </div>
                    <h3 class="font-bold text-headline-md text-white font-serif">
                        Acta Oficial de Cierre de Caja
                    </h3>
                    <p class="text-xs text-white/70 mt-0.5 font-sans">
                        Corte al {getCierreFechaStr(cierreSeleccionado)} a las {getCierreHoraStr(cierreSeleccionado)} por {cierreSeleccionado.cerradoPorNombre || "Administrador General"}
                    </p>
                </div>
                <button
                    onclick={() => isInformeCierreModalOpen = false}
                    class="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors"
                >
                    <span class="material-symbols-outlined text-[22px]">close</span>
                </button>
            </div>

            <!-- Body Informe -->
            <div class="p-6 overflow-y-auto space-y-6 flex-1 text-on-surface">
                
                <!-- 4 Tarjetas de Métricas -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="bg-surface-container-lowest border border-outline-variant p-4 rounded-xl text-center">
                        <div class="text-[10px] uppercase font-bold text-on-surface-variant">Saldo Liquidado</div>
                        <div class="text-headline-sm font-bold text-primary mt-1">
                            {formatCurrency(cierreSeleccionado.saldoNeto || 0)}
                        </div>
                    </div>
                    <div class="bg-surface-container-lowest border border-outline-variant p-4 rounded-xl text-center">
                        <div class="text-[10px] uppercase font-bold text-emerald-700">Ventas / Honorarios</div>
                        <div class="text-headline-sm font-bold text-emerald-600 mt-1">
                            {formatCurrency(cierreSeleccionado.ingresosVentas || 0)}
                        </div>
                    </div>
                    <div class="bg-surface-container-lowest border border-outline-variant p-4 rounded-xl text-center">
                        <div class="text-[10px] uppercase font-bold text-amber-700">Capital de Admin</div>
                        <div class="text-headline-sm font-bold text-amber-600 mt-1">
                            {formatCurrency(cierreSeleccionado.ingresosCapital || 0)}
                        </div>
                    </div>
                    <div class="bg-surface-container-lowest border border-outline-variant p-4 rounded-xl text-center">
                        <div class="text-[10px] uppercase font-bold text-error">Gastos Liquidados</div>
                        <div class="text-headline-sm font-bold text-error mt-1">
                            {formatCurrency(cierreSeleccionado.totalEgresos || 0)}
                        </div>
                    </div>
                </div>

                <!-- Observaciones -->
                <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant">
                    <div class="text-[11px] font-bold uppercase text-on-surface-variant mb-1">Observaciones Registradas:</div>
                    <p class="text-xs text-on-surface italic">
                        "{cierreSeleccionado.observaciones || "Cierre de caja sin observaciones adicionales."}"
                    </p>
                    <div class="mt-2 text-[10px] text-on-surface-variant">
                        Trámites finalizados archivados en este corte: <strong>{cierreSeleccionado.casosArchivadosCount || 0} trámites</strong>
                    </div>
                </div>

                <!-- Tabla de Personal con Saldo Cero -->
                <div>
                    <h4 class="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                        Auditoría de Cuentas por Empleado (Estado Post-Cierre)
                    </h4>
                    <div class="border border-outline-variant rounded-xl overflow-hidden">
                        <table class="w-full text-left text-xs">
                            <thead class="bg-surface-container-low text-on-surface-variant border-b border-outline-variant">
                                <tr>
                                    <th class="p-2.5 font-bold">Personal</th>
                                    <th class="p-2.5 font-bold text-right">Recaudado</th>
                                    <th class="p-2.5 font-bold text-right">Gastos</th>
                                    <th class="p-2.5 font-bold text-center">Balance Post-Cierre</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-outline-variant/60">
                                {#if cierreSeleccionado.desglosePorEmpleado && cierreSeleccionado.desglosePorEmpleado.length > 0}
                                    {#each cierreSeleccionado.desglosePorEmpleado as emp}
                                        <tr>
                                            <td class="p-2.5 font-bold text-on-surface">{emp.nombre}</td>
                                            <td class="p-2.5 text-right font-mono text-emerald-600">{formatCurrency(emp.ingresos || 0)}</td>
                                            <td class="p-2.5 text-right font-mono text-error">{formatCurrency(emp.egresos || 0)}</td>
                                            <td class="p-2.5 text-center font-mono font-bold text-emerald-700">
                                                Bs. 0.00 ✓
                                            </td>
                                        </tr>
                                    {/each}
                                {:else}
                                    <tr>
                                        <td colspan="4" class="p-3 text-center text-on-surface-variant">Sin desglose por empleado</td>
                                    </tr>
                                {/if}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            <!-- Footer Informe -->
            <div class="p-5 border-t border-outline-variant bg-surface-container-low flex justify-between items-center shrink-0">
                <button
                    type="button"
                    onclick={() => window.print()}
                    class="px-4 py-2 rounded-xl border border-outline-variant text-xs font-bold text-on-surface hover:bg-surface-container transition-colors flex items-center gap-1.5"
                >
                    <span class="material-symbols-outlined text-[16px]">print</span>
                    Imprimir Acta
                </button>
                <div class="flex gap-2">
                    <button
                        type="button"
                        onclick={() => isInformeCierreModalOpen = false}
                        class="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
                    >
                        Cerrar
                    </button>
                    <button
                        type="button"
                        onclick={() => handleDescargarPdfCierre(cierreSeleccionado)}
                        disabled={isDescargandoPdfCierre}
                        class="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-on-primary hover:opacity-90 transition-all flex items-center gap-1.5 shadow-md"
                    >
                        {#if isDescargandoPdfCierre}
                            <span class="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                            Generando PDF...
                        {:else}
                            <span class="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                            Descargar Acta Oficial en PDF
                        {/if}
                    </button>
                </div>
            </div>

        </div>
    </div>
{/if}
