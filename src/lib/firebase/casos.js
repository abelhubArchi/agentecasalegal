import { db } from './client.js';
import { getDoc } from 'firebase/firestore';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    onSnapshot, 
    query, 
    where, 
    orderBy, 
    serverTimestamp,
    arrayUnion,
    getCountFromServer,
    getDocs
} from 'firebase/firestore';
import { getTenantCollection, getTenantDoc } from './tenant.js';
import { addEvento } from './agenda.js';
import { registrarActividad } from './historial.js';
import { updateCliente } from './clientes.js';
import { addTransaccion } from './finanzas.js';

const CASOS_COLLECTION = 'casos';

/**
 * Agrega un nuevo caso / trámite
 */
export async function addCaso(casoData) {
    try {
        const snap = await getCountFromServer(getTenantCollection(CASOS_COLLECTION));
        const numTramite = snap.data().count + 1;
        const numeroIdentificador = `CL-${numTramite}`;

        const docRef = await addDoc(getTenantCollection(CASOS_COLLECTION), {
            ...casoData,
            numeroTramite: numeroIdentificador,
            creadoPor: casoData.creadoPor || 'Sistema',
            fechaCreacion: serverTimestamp(),
            estado: casoData.estado || 'Pendiente Docs', // Dynamic initial state
            montoAcordado: casoData.montoAcordado || 0,
            adelanto: casoData.adelanto || 0,
            saldoPendiente: (casoData.montoAcordado || 0) - (casoData.adelanto || 0),
            avances: [] // Array of { id, fecha, descripcion, tipo, creadoPor }
        });

        // Register initial transaction if there is an advance payment
        if (casoData.adelanto && casoData.adelanto > 0) {
            await addTransaccion({
                tipo: 'Ingreso',
                monto: parseFloat(casoData.adelanto),
                concepto: `Adelanto Trámite: ${casoData.titulo} (${numeroIdentificador})`,
                categoria: 'Procesos',
                notas: `Cliente: ${casoData.clienteNombre}`,
                fechaHora: new Date(),
                creadoPor: casoData.creadoPor || 'Sistema'
            });
        }
        
        // Auto-create a calendar event for the deadline (fechaLimite)
        if (casoData.fechaLimite) {
            const fechaValida = casoData.fechaLimite.includes('T') ? casoData.fechaLimite : `${casoData.fechaLimite}T12:00:00`;
            await addEvento({
                titulo: `Límite: ${casoData.titulo}`,
                tipo: 'Vencimiento Trámite',
                fechaHora: new Date(fechaValida),
                asignadoA: casoData.abogadoEncargado || 'todos',
                clienteId: casoData.clienteId || null,
                notas: `Trámite del cliente: ${casoData.clienteNombre}\nDescripción: ${casoData.descripcion}`,
                estado: 'Pendiente',
                creadoPor: casoData.creadoPor || casoData.abogadoEncargado,
                casoId: docRef.id // Link event to case
            });
        }
        
        await registrarActividad(
            'Trámites',
            'Nuevo Trámite',
            `Se inició el trámite/caso: ${casoData.titulo} para el cliente ${casoData.clienteNombre} (${numeroIdentificador})`,
            casoData.creadoPor || casoData.abogadoEncargado || 'Sistema'
        );
        
        // Update client status
        if (casoData.clienteId) {
            await updateCliente(casoData.clienteId, { 
                estado: 'En Trámite', 
                tramiteActual: docRef.id,
                tramiteFase: casoData.estado || 'Pendiente Docs',
                tramiteTitulo: casoData.titulo
            });
        }
        
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Error al añadir caso:", error);
        throw error;
    }
}

/**
 * Suscribe a los cambios de la colección Casos
 */
export function subscribeToCasos(callback) {
    const qAll = query(getTenantCollection(CASOS_COLLECTION), orderBy('fechaCreacion', 'desc'));
    
    return onSnapshot(qAll, (snapshot) => {
        const casos = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!data.archivado) {
                casos.push({ id: doc.id, ...data });
            }
        });
        callback(casos);
    }, (error) => {
        console.error("Error subscribing to casos:", error);
    });
}

/**
 * Actualiza información general del caso (incluido cambiar estado)
 */
export async function updateCaso(id, newData) {
    try {
        const docRef = getTenantDoc(CASOS_COLLECTION, id);
        await updateDoc(docRef, newData);
        
        if (newData.estado) {
            await registrarActividad(
                'Trámites',
                'Cambio de Estado',
                `Un trámite cambió su estado a: ${newData.estado}`,
                'Sistema'
            );
            
            // Sync status to the client document
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && docSnap.data().clienteId) {
                await updateCliente(docSnap.data().clienteId, { tramiteFase: newData.estado });
            }
        }
        
        return { success: true };
    } catch (error) {
        console.error("Error al actualizar caso:", error);
        throw error;
    }
}

/**
 * Registra un avance (Timeline) en el caso
 */
export async function registrarAvance(casoId, avanceData, programarEvento = null) {
    try {
        const docRef = getTenantDoc(CASOS_COLLECTION, casoId);
        
        const nuevoAvance = {
            id: Date.now().toString(),
            fecha: new Date().toISOString(),
            descripcion: avanceData.descripcion,
            tipo: avanceData.tipo, // 'Nota', 'Audiencia', 'Documento', 'Estado'
            creadoPor: avanceData.creadoPor
        };

        // Add to array
        await updateDoc(docRef, {
            avances: arrayUnion(nuevoAvance)
        });

        // If the advance has a scheduled date (like an audience), add it to global Calendar
        if (programarEvento) {
            await addEvento({
                titulo: `${avanceData.tipo}: ${programarEvento.titulo}`,
                tipo: avanceData.tipo,
                fechaHora: new Date(programarEvento.fechaHora),
                asignadoA: programarEvento.asignadoA || 'todos',
                clienteId: programarEvento.clienteId || null,
                notas: avanceData.descripcion,
                estado: 'Pendiente',
                creadoPor: avanceData.creadoPor,
                casoId: casoId // Link event to case
            });
        }
        
        await registrarActividad(
            'Trámites',
            'Nuevo Avance',
            `Se registró un nuevo avance en un trámite: ${avanceData.descripcion.substring(0, 50)}...`,
            avanceData.creadoPor || 'Sistema'
        );

        return { success: true };
    } catch (error) {
        console.error("Error al registrar avance:", error);
        throw error;
    }
}

/**
 * Elimina un caso
 */
export async function deleteCaso(id) {
    try {
        await deleteDoc(getTenantDoc(CASOS_COLLECTION, id));
        return { success: true };
    } catch (error) {
        console.error("Error al eliminar caso:", error);
        throw error;
    }
}

/**
 * Archiva un caso (soft delete)
 */
export async function archivarCaso(id, motivo = 'Archivado') {
    try {
        const docRef = getTenantDoc(CASOS_COLLECTION, id);
        await updateDoc(docRef, { archivado: true });
        
        await registrarActividad(
            'Trámites',
            'Trámite Archivado',
            `Un trámite fue archivado: ${motivo}`,
            'Sistema'
        );
        
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().clienteId) {
            await updateCliente(docSnap.data().clienteId, { 
                estado: 'Activo',
                tramiteActual: null,
                tramiteFase: null,
                tramiteTitulo: null
            });
        }
        
        return { success: true };
    } catch (error) {
        console.error("Error al archivar caso:", error);
        throw error;
    }
}

/**
 * Suscribe al Historial de Trámites Archivados / Finalizados en Cierres de Caja
 */
export function subscribeToCasosArchivados(callback) {
    const qAll = query(getTenantCollection(CASOS_COLLECTION), orderBy('fechaCreacion', 'desc'));
    
    return onSnapshot(qAll, (snapshot) => {
        const archivados = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.archivado === true) {
                archivados.push({ id: doc.id, ...data });
            }
        });
        callback(archivados);
    }, (error) => {
        console.error("Error subscribing to casos archivados:", error);
        callback([]);
    });
}

/**
 * Archiva todos los trámites con estado 'Finalizado' hasta la fecha/hora de corte del cierre de caja
 */
export async function archivarCasosFinalizadosPorFecha(fechaCorte = new Date(), cierreId = null) {
    try {
        const dateObj = fechaCorte instanceof Date ? fechaCorte : new Date(fechaCorte);
        const snapshot = await getDocs(getTenantCollection(CASOS_COLLECTION));
        const archivados = [];

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (data.estado === 'Finalizado' && !data.archivado) {
                let fechaCaso = data.fechaCreacion?.toDate ? data.fechaCreacion.toDate() : (data.fechaCreacion ? new Date(data.fechaCreacion) : new Date(0));
                
                if (fechaCaso <= dateObj || isNaN(dateObj.getTime())) {
                    await updateDoc(docSnap.ref, {
                        archivado: true,
                        cierreId: cierreId || 'cierre_general',
                        fechaArchivado: dateObj,
                        archivadoEnCierre: true
                    });
                    archivados.push({ id: docSnap.id, ...data });
                }
            }
        }

        if (archivados.length > 0) {
            await registrarActividad(
                'Trámites',
                'Cierre de Trámites Finalizados',
                `Se archivaron ${archivados.length} trámites finalizados por Cierre de Caja a fecha ${dateObj.toLocaleDateString('es-BO')}. Movidos al Historial.`,
                'Administrador General'
            );
        }

        return archivados;
    } catch (error) {
        console.error("Error al archivar casos finalizados:", error);
        return [];
    }
}
