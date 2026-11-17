import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '$lib/firebase/client.js';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import logoUrl from '$lib/assets/logo.webp';

export async function generarInformeGeneral(options = {}) {
    const { start, end } = options;

    try {
        const doc = new jsPDF();
        
        // Header
        doc.setFontSize(18);
        doc.setTextColor(40);
        let title = "Informe General - Casa Legal";
        if (start && end) {
            title = `Informe: ${start.toLocaleDateString('es-BO')} - ${end.toLocaleDateString('es-BO')}`;
        }
        doc.text(title, 14, 22);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        const date = new Date().toLocaleString('es-BO');
        doc.text(`Generado el: ${date}`, 14, 30);
        
        let startY = 40;

        // Fetch Data
        // 1. Clientes
        const clientesSnap = await getDocs(query(collection(db, 'clientes'), orderBy('fechaRegistro', 'desc')));
        let clientesData = [];
        clientesSnap.forEach(snap => {
            const data = snap.data();
            if (data.fechaRegistro) {
                const d = data.fechaRegistro.toDate ? data.fechaRegistro.toDate() : new Date(data.fechaRegistro);
                if (start && end && (d < start || d > end)) return;
            }
            clientesData.push([data.nombreCompleto, data.estado || 'Activo', data.telefono || '-', data.tramiteTitulo || 'Ninguno']);
        });

        if (clientesData.length > 0) {
            doc.setFontSize(14);
            doc.setTextColor(0);
            doc.text("Resumen de Clientes", 14, startY);
            
            autoTable(doc, {
                startY: startY + 5,
                head: [['Nombre', 'Estado', 'Teléfono', 'Trámite Actual']],
                body: clientesData,
                theme: 'striped',
                headStyles: { fillColor: [41, 128, 185] },
            });
            startY = doc.lastAutoTable.finalY + 15;
        }

        // 2. Casos / Trámites
        const casosSnap = await getDocs(query(collection(db, 'casos'), orderBy('fechaCreacion', 'desc')));
        let casosData = [];
        casosSnap.forEach(snap => {
            const data = snap.data();
            if (data.fechaCreacion) {
                const d = data.fechaCreacion.toDate ? data.fechaCreacion.toDate() : new Date(data.fechaCreacion);
                if (start && end && (d < start || d > end)) return;
            }
            casosData.push([data.numeroTramite || '-', data.titulo, data.clienteNombre, data.estado || 'Pendiente', data.montoAcordado ? `Bs. ${data.montoAcordado}` : '-']);
        });

        if (casosData.length > 0) {
            if (startY > 250) {
                doc.addPage();
                startY = 20;
            }
            doc.setFontSize(14);
            doc.text("Trámites y Procesos", 14, startY);
            
            autoTable(doc, {
                startY: startY + 5,
                head: [['#', 'Título', 'Cliente', 'Estado', 'Monto']],
                body: casosData,
                theme: 'striped',
                headStyles: { fillColor: [39, 174, 96] },
            });
            startY = doc.lastAutoTable.finalY + 15;
        }
        
        // 3. Finanzas (Transacciones)
        const transSnap = await getDocs(query(collection(db, 'transacciones'), orderBy('fechaHora', 'desc')));
        let transData = [];
        let totalIngresos = 0;
        let totalEgresos = 0;
        
        transSnap.forEach(snap => {
            const data = snap.data();
            if (data.fechaHora) {
                const d = data.fechaHora.toDate ? data.fechaHora.toDate() : new Date(data.fechaHora);
                if (start && end && (d < start || d > end)) return;
            }

            const fecha = data.fechaHora ? new Date(data.fechaHora.toDate ? data.fechaHora.toDate() : data.fechaHora).toLocaleDateString() : '-';
            const monto = parseFloat(data.monto) || 0;
            if (data.tipo === 'Ingreso') totalIngresos += monto;
            else if (data.tipo === 'Egreso') totalEgresos += monto;
            
            transData.push([fecha, data.tipo, data.categoria || '-', `Bs. ${monto.toLocaleString('es-BO')}`]);
        });
        
        // Solo mostramos los últimos 20 para no hacer el reporte tan largo
        if (transData.length > 20) {
            transData = transData.slice(0, 20);
        }

        if (transData.length > 0) {
            if (startY > 220) {
                doc.addPage();
                startY = 20;
            }
            doc.setFontSize(14);
            doc.text("Resumen Financiero (Últimas Transacciones)", 14, startY);
            
            doc.setFontSize(10);
            doc.text(`Total Ingresos (Histórico): Bs. ${totalIngresos.toLocaleString('es-BO')}`, 14, startY + 6);
            doc.text(`Total Egresos (Histórico): Bs. ${totalEgresos.toLocaleString('es-BO')}`, 14, startY + 12);
            doc.text(`Balance General: Bs. ${(totalIngresos - totalEgresos).toLocaleString('es-BO')}`, 14, startY + 18);
            
            autoTable(doc, {
                startY: startY + 22,
                head: [['Fecha', 'Tipo', 'Categoría', 'Monto']],
                body: transData,
                theme: 'striped',
                headStyles: { fillColor: [243, 156, 18] },
            });
            startY = doc.lastAutoTable.finalY + 15;
        }

        doc.save(`Informe_General_CasaLegal_${Date.now()}.pdf`);
        return true;
    } catch (error) {
        console.error("Error generando PDF:", error);
        throw error;
    }
}

export async function generarFacturaPago(pagoData) {
    try {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a5' // A5 size is good for receipts
        });

        // Header info
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text("RECIBO DE PAGO", 14, 40);

        try {
            const img = new Image();
            img.src = logoUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            const canvas = document.createElement('canvas');
            // scale down the canvas
            const scale = 20 / img.height; 
            canvas.width = img.width * scale;
            canvas.height = 20;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            
            doc.addImage(dataUrl, 'PNG', 14, 10, canvas.width, canvas.height, '', 'FAST'); 
        } catch (e) {
            console.warn("Could not load logo:", e);
            doc.setFontSize(16);
            doc.text("CASA LEGAL", 14, 20);
        }

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`N°: ${pagoData.id || Date.now()}`, 14, 46);
        const fechaStr = pagoData.fecha ? new Date(pagoData.fecha).toLocaleDateString('es-BO') : new Date().toLocaleDateString('es-BO');
        doc.text(`Fecha: ${fechaStr}`, 14, 52);

        // Body info
        doc.setTextColor(0);
        doc.setFontSize(11);
        doc.text(`Cliente: ${pagoData.clienteNombre || 'N/A'}`, 14, 65);
        
        // Handle long concepts by splitting
        const splitConcepto = doc.splitTextToSize(`Concepto: ${pagoData.concepto || 'Pago de Servicios'}`, 120);
        doc.text(splitConcepto, 14, 73);

        const yPosForTotal = 73 + (splitConcepto.length * 5) + 5;

        // Box for Amount
        doc.setDrawColor(200);
        doc.setFillColor(245, 245, 245);
        doc.rect(14, yPosForTotal, 120, 15, 'F');
        
        doc.setFontSize(14);
        doc.text(`TOTAL: Bs. ${parseFloat(pagoData.monto).toLocaleString('es-BO')}`, 20, yPosForTotal + 10);

        // Footer
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text("Gracias por su preferencia.", 14, yPosForTotal + 30);

        doc.save(`Recibo_CASA_LEGAL_${pagoData.id || Date.now()}.pdf`);
        return true;
    } catch (error) {
        console.error("Error al generar factura:", error);
        throw error;
    }
}

/**
 * Genera el Acta Oficial de Cierre de Caja y Arqueo General en PDF de alta fidelidad
 */
export async function generarPdfCierreCaja(cierre, empresa = {}) {
    try {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const nombreFirma = empresa.nombre || 'CASA LEGAL';
        const subtituloFirma = empresa.subtitulo || 'Firma Jurídica e Inmobiliaria';
        const moneda = empresa.moneda || 'Bs.';

        // Banda superior institucional
        doc.setFillColor(15, 35, 25); // Verde muy oscuro institucional
        doc.rect(0, 0, 210, 16, 'F');
        doc.setFillColor(197, 160, 89); // Acento dorado
        doc.rect(0, 16, 210, 2, 'F');

        doc.setFontSize(9);
        doc.setTextColor(240, 240, 240);
        doc.setFont('helvetica', 'bold');
        doc.text("DOCUMENTO OFICIAL DE AUDITORÍA CONTABLE Y CONTROL DE CAJA", 105, 10, { align: 'center' });

        // Membrete
        doc.setFontSize(20);
        doc.setTextColor(15, 35, 25);
        doc.setFont('helvetica', 'bold');
        doc.text(nombreFirma.toUpperCase(), 14, 30);

        doc.setFontSize(10);
        doc.setTextColor(100, 110, 120);
        doc.setFont('helvetica', 'normal');
        doc.text(subtituloFirma, 14, 35);
        doc.text(`NIT: ${empresa.nit || '1029384756'} | ${empresa.ciudad || 'Santa Cruz, Bolivia'} | Tel: ${empresa.telefono || '+591 70000000'}`, 14, 40);

        // Cuadro Folio y Fecha (Derecha)
        doc.setDrawColor(197, 160, 89);
        doc.setFillColor(252, 250, 245);
        doc.roundedRect(130, 22, 66, 22, 2, 2, 'FD');

        doc.setFontSize(8);
        doc.setTextColor(130, 100, 40);
        doc.setFont('helvetica', 'bold');
        doc.text("ACTA OFICIAL DE CORTE", 163, 27, { align: 'center' });
        doc.setFontSize(12);
        doc.setTextColor(20, 20, 20);
        doc.text(cierre.folio || 'CORTE-001', 163, 34, { align: 'center' });

        const fechaDoc = cierre.fechaHora?.toDate ? cierre.fechaHora.toDate() : (cierre.fechaHora ? new Date(cierre.fechaHora) : new Date());
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'normal');
        doc.text(`${fechaDoc.toLocaleDateString('es-BO')} - ${fechaDoc.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}`, 163, 40, { align: 'center' });

        // Línea divisoria
        doc.setDrawColor(220, 225, 230);
        doc.line(14, 46, 196, 46);

        // Datos del Administrador y Estado
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.setFont('helvetica', 'bold');
        doc.text("Responsable de Cierre:", 14, 52);
        doc.setFont('helvetica', 'normal');
        doc.text(`${cierre.cerradoPorNombre || 'Administrador General'} (${cierre.cerradoPorEmail || 'admin'})`, 52, 52);

        doc.setFont('helvetica', 'bold');
        doc.text("Estatus del Cierre:", 130, 52);
        doc.setTextColor(0, 120, 60);
        doc.text("LIQUIDADO Y CUENTAS EN CERO", 160, 52);

        // 3 Tarjetas Grandes de Resumen Financiero
        const tarjetaY = 57;
        const tarjetaW = 58;
        const tarjetaH = 22;

        // Tarjeta 1: Total Ingresos
        doc.setFillColor(240, 253, 244);
        doc.setDrawColor(187, 247, 208);
        doc.roundedRect(14, tarjetaY, tarjetaW, tarjetaH, 2, 2, 'FD');
        doc.setFontSize(8);
        doc.setTextColor(22, 101, 52);
        doc.setFont('helvetica', 'bold');
        doc.text("TOTAL RECAUDADO", 18, tarjetaY + 6);
        doc.setFontSize(13);
        doc.text(`${moneda} ${(cierre.totalIngresos || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`, 18, tarjetaY + 16);

        // Tarjeta 2: Total Egresos
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(254, 202, 202);
        doc.roundedRect(75, tarjetaY, tarjetaW, tarjetaH, 2, 2, 'FD');
        doc.setFontSize(8);
        doc.setTextColor(153, 27, 27);
        doc.setFont('helvetica', 'bold');
        doc.text("GASTOS Y RETIROS", 79, tarjetaY + 6);
        doc.setFontSize(13);
        doc.text(`${moneda} ${(cierre.totalEgresos || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`, 79, tarjetaY + 16);

        // Tarjeta 3: Saldo Neto en Bóveda
        doc.setFillColor(254, 249, 195);
        doc.setDrawColor(253, 224, 71);
        doc.roundedRect(138, tarjetaY, tarjetaW, tarjetaH, 2, 2, 'FD');
        doc.setFontSize(8);
        doc.setTextColor(133, 77, 14);
        doc.setFont('helvetica', 'bold');
        doc.text("SALDO NETO ARQUEADO", 142, tarjetaY + 6);
        doc.setFontSize(13);
        doc.text(`${moneda} ${(cierre.saldoNeto || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`, 142, tarjetaY + 16);

        // Tabla 1: Desglose por Empleado / Abogado (Cuentas que quedan en cero)
        let curY = tarjetaY + tarjetaH + 8;
        doc.setFontSize(11);
        doc.setTextColor(15, 35, 25);
        doc.setFont('helvetica', 'bold');
        doc.text("1. Liquidación Individual por Miembro del Equipo (Saldos en Cero)", 14, curY);

        const empleadosRows = (cierre.desglosePorEmpleado || []).map(emp => [
            emp.nombre || 'Personal General',
            `${moneda} ${(emp.ingresos || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`,
            `${moneda} ${(emp.egresos || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`,
            `${moneda} ${(emp.balance || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`,
            `${moneda} 0.00 (Liquidado)`,
            `${emp.operaciones || 0}`
        ]);

        if (empleadosRows.length === 0) {
            empleadosRows.push(['Caja General / Sin operaciones pendientes', `${moneda} 0.00`, `${moneda} 0.00`, `${moneda} 0.00`, `${moneda} 0.00`, '0']);
        }

        autoTable(doc, {
            startY: curY + 3,
            head: [['Abogado / Empleado', 'Ingresos', 'Egresos', 'Saldo Liquidado', 'Nuevo Saldo', 'Movs.']],
            body: empleadosRows,
            theme: 'striped',
            headStyles: { fillColor: [15, 35, 25], fontSize: 8, fontStyle: 'bold' },
            bodyStyles: { fontSize: 8 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 55 },
                1: { halign: 'right', textColor: [22, 101, 52] },
                2: { halign: 'right', textColor: [153, 27, 27] },
                3: { halign: 'right', fontStyle: 'bold' },
                4: { halign: 'center', textColor: [0, 100, 50], fontStyle: 'bold' },
                5: { halign: 'center' }
            }
        });

        curY = doc.lastAutoTable.finalY + 8;

        // Tabla 2: Desglose por Categorías
        if (curY > 210) {
            doc.addPage();
            curY = 20;
        }

        doc.setFontSize(11);
        doc.setTextColor(15, 35, 25);
        doc.setFont('helvetica', 'bold');
        doc.text("2. Desglose de Operaciones por Categoría", 14, curY);

        const categoriasEntries = Object.entries(cierre.desglosePorCategoria || {});
        const catRows = categoriasEntries.map(([cat, val]) => [
            cat,
            `${moneda} ${(val.ingresos || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`,
            `${moneda} ${(val.egresos || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`,
            `${moneda} ${(val.total || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`,
            `${val.count || 0}`
        ]);

        if (catRows.length > 0) {
            autoTable(doc, {
                startY: curY + 3,
                head: [['Categoría', 'Ingresos', 'Egresos', 'Neto', 'Tickets']],
                body: catRows,
                theme: 'grid',
                headStyles: { fillColor: [197, 160, 89], textColor: [20, 20, 20], fontSize: 8, fontStyle: 'bold' },
                bodyStyles: { fontSize: 8 },
                columnStyles: {
                    1: { halign: 'right', textColor: [22, 101, 52] },
                    2: { halign: 'right', textColor: [153, 27, 27] },
                    3: { halign: 'right', fontStyle: 'bold' },
                    4: { halign: 'center' }
                }
            });
            curY = doc.lastAutoTable.finalY + 8;
        }

        // Observaciones
        if (curY > 230) {
            doc.addPage();
            curY = 20;
        }

        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);
        doc.setFont('helvetica', 'bold');
        doc.text("Observaciones de Auditoría:", 14, curY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(cierre.observaciones || 'Arqueo concluido satisfactoriamente. Todos los fondos fueron conciliados y auditados.', 14, curY + 5, { maxWidth: 182 });

        curY += 16;

        // Firmas de Conformidad
        if (curY > 240) {
            doc.addPage();
            curY = 30;
        }

        const firmaY = curY + 12;
        doc.setDrawColor(120, 120, 120);
        doc.line(25, firmaY, 85, firmaY);
        doc.line(125, firmaY, 185, firmaY);

        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        doc.setFont('helvetica', 'bold');
        doc.text("ADMINISTRADOR GENERAL", 55, firmaY + 5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.text("Entregó y Liquidó Conforme", 55, firmaY + 9, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.text("AUDITORÍA / TESORERÍA", 155, firmaY + 5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.text("Recibió Fondos y Arqueo Conforme", 155, firmaY + 9, { align: 'center' });

        // Pie de página
        doc.setFontSize(7.5);
        doc.setTextColor(140, 140, 140);
        doc.text(`${empresa.piePagina || 'Documento Confidencial'} — Generado automáticamente por el Sistema Contable — ${nombreFirma}`, 105, 290, { align: 'center' });

        doc.save(`Acta_Cierre_Caja_${cierre.folio || Date.now()}.pdf`);
        return true;
    } catch (e) {
        console.error("Error al generar PDF de cierre:", e);
        throw e;
    }
}

