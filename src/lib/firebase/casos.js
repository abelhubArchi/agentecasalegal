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
    orderBy, 
    serverTimestamp,
    arrayUnion
} from 'firebase/firestore';
import { addEvento } from './agenda.js';
import { registrarActividad } from './historial.js';
import { updateCliente } from './clientes.js';

const CASOS_COLLECTION = 'casos';

/**
 * Agrega un nuevo caso / trámite
 */
export async function addCaso(casoData) {
    try {
        const docRef = await addDoc(collection(db, CASOS_COLLECTION), {
            ...casoData,
            fechaCreacion: serverTimestamp(),
            estado: 'Pendiente Docs', // Default state: Pendiente Docs, En Proceso, Adentro, Finalizado
            avances: [] // Array of { id, fecha, descripcion, tipo, creadoPor }
        });
        
        // Auto-create a calendar event for the deadline (fechaLimite)
        if (casoData.fechaLimite) {
            await addEvento({
                titulo: `Límite: ${casoData.titulo}`,
                tipo: 'Vencimiento Trámite',
                fechaHora: new Date(casoData.fechaLimite),
                asignadoA: casoData.abogadoEncargado || 'todos',
                notas: `Trámite del cliente: ${casoData.clienteNombre}\nDescripción: ${casoData.descripcion}`,
                estado: 'Pendiente',
                creadoPor: casoData.abogadoEncargado,
                casoId: docRef.id // Link event to case
            });
        }
        
        await registrarActividad(
            'Trámites',
            'Nuevo Trámite',
            `Se inició el trámite/caso: ${casoData.titulo} para el cliente ${casoData.clienteNombre}`,
            casoData.abogadoEncargado || 'Sistema'
        );
        
        // Update client status
        if (casoData.clienteId) {
            await updateCliente(casoData.clienteId, { 
                estado: 'En Trámite', 
                tramiteActual: docRef.id,
                tramiteFase: 'Pendiente Docs',
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
    const q = query(collection(db, CASOS_COLLECTION), orderBy('fechaCreacion', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
        const casos = [];
        snapshot.forEach((doc) => {
            casos.push({ id: doc.id, ...doc.data() });
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
