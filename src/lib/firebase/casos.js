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
    getCountFromServer
} from 'firebase/firestore';
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
        const snap = await getCountFromServer(collection(db, CASOS_COLLECTION));
        const numTramite = snap.data().count + 1;
        const numeroIdentificador = numTramite.toString();

        const docRef = await addDoc(collection(db, CASOS_COLLECTION), {
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
                categoria: 'Honorarios',
                notas: `Cliente: ${casoData.clienteNombre}`,
                fechaHora: new Date(),
                creadoPor: casoData.creadoPor || 'Sistema'
            });
        }
        
        // Auto-create a calendar event for the deadline (fechaLimite)
        if (casoData.fechaLimite) {
            // Append T12:00:00 so JS Date avoids UTC day-shifting backward in America timezones
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
    const q = query(
        collection(db, CASOS_COLLECTION),
        where('archivado', '!=', true), // Ignore archived cases
        orderBy('archivado'), // Requires index on archivado, but wait... where archivado != true requires orderBy archivado first in firestore. Let's just filter it client side or use where archivado == false.
    );
    // Actually, setting archivado: false explicitly on add is better so we can use == false. Or we can just fetch all and filter in JS. Let's filter in JS to avoid index issues if we don't want to create composite indexes.
    
    const qAll = query(collection(db, CASOS_COLLECTION), orderBy('fechaCreacion', 'desc'));
    
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
        const docRef = doc(db, CASOS_COLLECTION, id);
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
        const docRef = doc(db, CASOS_COLLECTION, casoId);
        
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
        await deleteDoc(doc(db, CASOS_COLLECTION, id));
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
        const docRef = doc(db, CASOS_COLLECTION, id);
        await updateDoc(docRef, { archivado: true });
        
        await registrarActividad(
            'Trámites',
            'Trámite Archivado',
            `Un trámite fue archivado: ${motivo}`,
            'Sistema'
        );
        
        // Optionally update client to clear active tramite if it was this one
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
