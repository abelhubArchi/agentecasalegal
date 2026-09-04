import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '$lib/firebase/client.js';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

export async function generarInformeGeneral(options = {}) {
    const { start, end } = options;

    try {
        const doc = new jsPDF();
        
        // Header
        doc.setFontSize(18);
        doc.setTextColor(40);
        let title = "Informe General - Casa Legal";
        if (start && end) {
            title = `Informe: ${start.toLocaleDateString('es-MX')} - ${end.toLocaleDateString('es-MX')}`;
        }
        doc.text(title, 14, 22);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        const date = new Date().toLocaleString('es-MX');
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
            casosData.push([data.numeroTramite || '-', data.titulo, data.clienteNombre, data.estado || 'Pendiente', data.montoAcordado ? `$${data.montoAcordado}` : '-']);
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
            
            transData.push([fecha, data.tipo, data.categoria || '-', `$${monto.toLocaleString('es-MX')}`]);
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
            doc.text(`Total Ingresos (Histórico): $${totalIngresos.toLocaleString('es-MX')}`, 14, startY + 6);
            doc.text(`Total Egresos (Histórico): $${totalEgresos.toLocaleString('es-MX')}`, 14, startY + 12);
            doc.text(`Balance General: $${(totalIngresos - totalEgresos).toLocaleString('es-MX')}`, 14, startY + 18);
            
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
