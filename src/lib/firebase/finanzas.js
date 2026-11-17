import { db, storage } from './client.js';
import { 
    collection, 
    onSnapshot, 
    addDoc, 
    updateDoc, 
    doc, 
    deleteDoc, 
    query, 
    orderBy, 
    where, 
    getDocs, 
    limit as fsLimit,
    serverTimestamp,
    writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { registrarActividad } from './historial.js';
import { archivarCasosFinalizadosPorFecha } from './casos.js';

import { getTenantCollection, getTenantDoc } from './tenant.js';

const getTransaccionesCol = () => getTenantCollection('transacciones');
const getContratosCol = () => getTenantCollection('contratos_recurrentes');
const getCierresCol = () => getTenantCollection('cierres_caja');

export function subscribeToTransacciones(limiteOrCallback, callbackOpt) {
    let limite = 100;
    let callback;
    if (typeof limiteOrCallback === 'function') {
        callback = limiteOrCallback;
    } else {
        limite = limiteOrCallback;
        callback = callbackOpt;
    }
    
    const q = query(getTransaccionesCol(), orderBy('fechaHora', 'desc'), fsLimit(limite));
    return onSnapshot(q, (snapshot) => {
        const transacciones = [];
        snapshot.forEach((doc) => {
            transacciones.push({ id: doc.id, ...doc.data() });
        });
        callback(transacciones);
    });
}

/**
 * Suscribe al historial de cierres de caja en tiempo real
 */
export function subscribeToCierresCaja(callback) {
    const q = query(getCierresCol(), orderBy('fechaHora', 'desc'), fsLimit(50));
    return onSnapshot(q, (snapshot) => {
        const cierres = [];
        snapshot.forEach((doc) => {
            cierres.push({ id: doc.id, ...doc.data() });
        });
        callback(cierres);
    }, (err) => {
        console.warn("Error en subscribeToCierresCaja:", err);
        callback([]);
    });
}

/**
 * Calcula los totales financieros.
 * - Si soloAbiertas === true, solo toma en cuenta transacciones que NO hayan sido cerradas.
 * - Separa los ingresos reales de ventas (honorarios, trámites, servicios, alquileres)
 *   del Capital aportado por el Admin a los empleados.
 */
export async function getTotales(filtroUid = null, soloAbiertas = true, fechaCorte = null) {
    try {
        const snapshot = await getDocs(getTransaccionesCol());
        let ingresos = 0;
        let ingresosVentas = 0;
        let ingresosCapital = 0;
        let egresos = 0;
        let totalOperaciones = 0;
        const fechaLimite = fechaCorte ? (fechaCorte instanceof Date ? fechaCorte : new Date(fechaCorte)) : null;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const f = data.fechaHora?.toDate ? data.fechaHora.toDate() : (data.fechaHora ? new Date(data.fechaHora) : new Date(0));

            // Si hay fecha límite establecida
            if (fechaLimite && f > fechaLimite) {
                return;
            }

            // Si filtramos solo transacciones abiertas del turno actual:
            if (soloAbiertas && data.cerrado === true) {
                return;
            }
            if (filtroUid && filtroUid !== 'todos' && data.creadoPor !== filtroUid) {
                return;
            }

            const monto = Number(data.monto) || 0;
            if (data.tipo === 'Ingreso') {
                ingresos += monto;
                if (data.categoria === 'Capital' || data.esCapital === true) {
                    ingresosCapital += monto;
                } else {
                    ingresosVentas += monto;
                }
                totalOperaciones++;
            }
            if (data.tipo === 'Egreso') {
                egresos += monto;
                totalOperaciones++;
            }
        });

        return { 
            ingresos, 
            ingresosVentas,
            ingresosCapital,
            egresos, 
            balance: ingresos - egresos,
            totalOperaciones 
        };
    } catch (e) {
        console.warn("Error calculando totales:", e);
        return { ingresos: 0, ingresosVentas: 0, ingresosCapital: 0, egresos: 0, balance: 0, totalOperaciones: 0 };
    }
}

export async function getTransaccionesPorRango(inicio, fin, filtroUid = null) {
    let restricciones = [
        where('fechaHora', '>=', inicio),
        where('fechaHora', '<=', fin),
        orderBy('fechaHora', 'asc')
    ];
    
    try {
        const q = query(getTransaccionesCol(), ...restricciones);
        const snapshot = await getDocs(q);
        const resultados = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (filtroUid && filtroUid !== 'todos' && data.creadoPor !== filtroUid) return;
            resultados.push({ id: doc.id, ...data });
        });
        return resultados;
    } catch (e) {
        console.warn("Fallback local para getTransaccionesPorRango:", e);
        const snapshot = await getDocs(getTransaccionesCol());
        const resultados = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const f = data.fechaHora?.toDate ? data.fechaHora.toDate() : new Date(data.fechaHora);
            if (f >= inicio && f <= fin) {
                if (filtroUid && filtroUid !== 'todos' && data.creadoPor !== filtroUid) return;
                resultados.push({ id: docSnap.id, ...data });
            }
        });
        return resultados.sort((a,b) => (a.fechaHora || 0) - (b.fechaHora || 0));
    }
}

/**
 * Obtiene todas las transacciones abiertas que aún no han sido liquidadas / cerradas,
 * opcionalmente filtradas hasta una fecha y hora de corte exacta.
 */
export async function getTransaccionesAbiertas(empleados = [], fechaCorte = null) {
    const snapshot = await getDocs(getTransaccionesCol());
    const abiertas = [];
    let totalIngresos = 0;
    let ingresosVentas = 0;
    let ingresosCapital = 0;
    let totalEgresos = 0;
    const desglosePorEmpleadoMap = {};
    const desglosePorCategoriaMap = {};
    const fechaLimite = fechaCorte ? (fechaCorte instanceof Date ? fechaCorte : new Date(fechaCorte)) : null;

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.cerrado === true) return; // Ya está cerrada

        const f = data.fechaHora?.toDate ? data.fechaHora.toDate() : (data.fechaHora ? new Date(data.fechaHora) : new Date(0));
        if (fechaLimite && f > fechaLimite) return; // Fuera del rango de corte seleccionado

        const t = { id: docSnap.id, ...data, fechaParsed: f };
        abiertas.push(t);

        const monto = Number(data.monto) || 0;
        const tipo = data.tipo;
        const uid = data.creadoPor || 'desconocido';
        const emp = empleados.find(e => e.authUid === uid || e.id === uid);
        const nombreEmp = emp ? (emp.nombre + (emp.apellidos ? ` ${emp.apellidos}` : '')) : (data.creadoPorNombre || 'Personal / General');
        const cat = data.categoria || 'Sin Categoría';
        const esCap = cat === 'Capital' || data.esCapital === true;

        if (tipo === 'Ingreso') {
            totalIngresos += monto;
            if (esCap) {
                ingresosCapital += monto;
            } else {
                ingresosVentas += monto;
            }
        }
        if (tipo === 'Egreso') {
            totalEgresos += monto;
        }

        // Por Empleado
        if (!desglosePorEmpleadoMap[uid]) {
            desglosePorEmpleadoMap[uid] = {
                uid,
                nombre: nombreEmp,
                ingresos: 0,
                ingresosVentas: 0,
                ingresosCapital: 0,
                egresos: 0,
                balance: 0,
                operaciones: 0
            };
        }
        if (tipo === 'Ingreso') {
            desglosePorEmpleadoMap[uid].ingresos += monto;
            if (esCap) desglosePorEmpleadoMap[uid].ingresosCapital += monto;
            else desglosePorEmpleadoMap[uid].ingresosVentas += monto;
        }
        if (tipo === 'Egreso') {
            desglosePorEmpleadoMap[uid].egresos += monto;
        }
        desglosePorEmpleadoMap[uid].balance = desglosePorEmpleadoMap[uid].ingresos - desglosePorEmpleadoMap[uid].egresos;
        desglosePorEmpleadoMap[uid].operaciones++;

        // Por Categoría
        if (!desglosePorCategoriaMap[cat]) {
            desglosePorCategoriaMap[cat] = { total: 0, ingresos: 0, egresos: 0, count: 0 };
        }
        if (tipo === 'Ingreso') desglosePorCategoriaMap[cat].ingresos += monto;
        if (tipo === 'Egreso') desglosePorCategoriaMap[cat].egresos += monto;
        desglosePorCategoriaMap[cat].total += (tipo === 'Ingreso' ? monto : -monto);
        desglosePorCategoriaMap[cat].count++;
    });

    return {
        transacciones: abiertas,
        totalIngresos,
        ingresosVentas,
        ingresosCapital,
        totalEgresos,
        saldoNeto: totalIngresos - totalEgresos,
        totalOperaciones: abiertas.length,
        desglosePorEmpleado: Object.values(desglosePorEmpleadoMap),
        desglosePorCategoria: desglosePorCategoriaMap
    };
}

/**
 * CIERRE DE CAJA PARA EL ADMINISTRADOR GENERAL
 * - Acepta fecha y hora exacta de corte.
 * - Archiva y mueve al historial todos los trámites finalizados en la fecha del corte.
 * - Liquida las transacciones abiertas hasta esa fecha/hora, dejando las cuentas de todos en Bs. 0.00.
 * - Guarda el acta inmutable en `cierres_caja`.
 */
export async function ejecutarCierreDeCaja({ 
    adminUid, 
    adminNombre, 
    adminEmail, 
    observaciones = '', 
    empleados = [],
    fechaCorte = new Date()
}) {
    const dateCorte = fechaCorte instanceof Date ? fechaCorte : new Date(fechaCorte);

    // 1. Obtener datos exactos de transacciones abiertas hasta la fecha/hora de corte
    const balanceActual = await getTransaccionesAbiertas(empleados, dateCorte);
    
    // Generar Folio formal de Cierre
    const snapCierres = await getDocs(getCierresCol());
    const numeroCierre = snapCierres.size + 1;
    const year = dateCorte.getFullYear();
    const month = String(dateCorte.getMonth() + 1).padStart(2, '0');
    const day = String(dateCorte.getDate()).padStart(2, '0');
    const folio = `CORTE-${year}${month}${day}-${String(numeroCierre).padStart(3, '0')}`;

    // 2. Archivar casos/trámites finalizados a la fecha de corte
    const casosArchivados = await archivarCasosFinalizadosPorFecha(dateCorte, folio);

    const nuevoCierreData = {
        folio,
        fechaHora: dateCorte,
        fechaCorte: dateCorte,
        cerradoPorUid: adminUid || 'admin',
        cerradoPorNombre: adminNombre || 'Administrador General',
        cerradoPorEmail: adminEmail || 'admin@casalegal.bo',
        totalIngresos: balanceActual.totalIngresos,
        ingresosVentas: balanceActual.ingresosVentas,
        ingresosCapital: balanceActual.ingresosCapital,
        totalEgresos: balanceActual.totalEgresos,
        saldoNeto: balanceActual.saldoNeto,
        cantidadTransacciones: balanceActual.totalOperaciones,
        desglosePorEmpleado: balanceActual.desglosePorEmpleado,
        desglosePorCategoria: balanceActual.desglosePorCategoria,
        casosArchivadosCount: casosArchivados.length,
        casosArchivadosIds: casosArchivados.map(c => c.id),
        observaciones: observaciones.trim() || 'Cierre de caja y arqueo general sin observaciones.',
        transaccionesIds: balanceActual.transacciones.map(t => t.id),
        estado: 'LIQUIDADO_Y_CERRADO',
        createdAt: serverTimestamp()
    };

    // 3. Guardar documento oficial de Cierre
    const cierreDocRef = await addDoc(getCierresCol(), nuevoCierreData);
    const cierreId = cierreDocRef.id;

    // 4. Marcar todas las transacciones incluidas como cerradas en batches
    if (balanceActual.transacciones.length > 0) {
        const batch = writeBatch(db);
        balanceActual.transacciones.forEach(tx => {
            const txRef = getTenantDoc('transacciones', tx.id);
            batch.update(txRef, {
                cerrado: true,
                cierreId: cierreId,
                fechaCierre: dateCorte
            });
        });
        await batch.commit();
    }

    // 5. Registrar en bitácora de auditoría
    await registrarActividad(
        'Finanzas',
        'Cierre de Caja General',
        `Se ejecutó con éxito el Cierre de Caja ${folio} a fecha ${dateCorte.toLocaleString('es-BO')}. Recaudación: Bs. ${balanceActual.totalIngresos.toLocaleString('es-BO')} (Ventas: Bs. ${balanceActual.ingresosVentas.toLocaleString('es-BO')}, Capital Admin: Bs. ${balanceActual.ingresosCapital.toLocaleString('es-BO')}). Trámites finalizados archivados: ${casosArchivados.length}. Cuentas restablecidas a Bs. 0.00.`,
        adminNombre || 'Administrador General'
    );

    return {
        id: cierreId,
        ...nuevoCierreData
    };
}

export async function addTransaccion(transaccionData) {
    const res = await addDoc(getTransaccionesCol(), {
        ...transaccionData,
        cerrado: false, // Inicia abierta para el turno actual
        esCapital: transaccionData.categoria === 'Capital',
        createdAt: new Date()
    });
    
    await registrarActividad(
        'Finanzas',
        transaccionData.tipo === 'Ingreso' ? 'Nuevo Ingreso' : 'Nuevo Gasto',
        `Se registró un ${transaccionData.tipo} (${transaccionData.categoria}) por Bs. ${transaccionData.monto}: ${transaccionData.concepto}`,
        transaccionData.creadoPorNombre || transaccionData.creadoPor || 'Sistema'
    );
    
    return res;
}

export async function updateTransaccion(id, transaccionData) {
    const docRef = getTenantDoc('transacciones', id);
    return await updateDoc(docRef, {
        ...transaccionData,
        esCapital: transaccionData.categoria === 'Capital'
    });
}

export async function deleteTransaccion(id) {
    const docRef = getTenantDoc('transacciones', id);
    return await deleteDoc(docRef);
}

export async function uploadRecibo(file) {
    if (!file) return null;
    const fileName = `recibos/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, fileName);
    
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
}

// Para la parte inmobiliaria / cobros recurrentes
export function subscribeToContratos(callback) {
    const q = query(getContratosCol(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const contratos = [];
        snapshot.forEach((doc) => {
            contratos.push({ id: doc.id, ...doc.data() });
        });
        callback(contratos);
    });
}

export async function addContratoRecurrente(contratoData) {
    return await addDoc(getContratosCol(), {
        ...contratoData,
        createdAt: new Date()
    });
}
