import { db } from './client.js';
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp,
    limit
} from 'firebase/firestore';
import { getTenantCollection } from './tenant.js';

const HISTORIAL_COLLECTION = 'historial';

/**
 * Registra una nueva actividad global
 * @param {string} modulo - Ej. 'Finanzas', 'Clientes', 'Casos', 'Documentos'
 * @param {string} tipo - Ej. 'Gasto Añadido', 'Visita Física', 'Cambio de Estado'
 * @param {string} descripcion - Descripción amigable
 * @param {string} autorNombre - Nombre de la persona que lo hizo (o UID)
 */
export async function registrarActividad(modulo, tipo, descripcion, autorNombre) {
    try {
        await addDoc(getTenantCollection(HISTORIAL_COLLECTION), {
            modulo,
            tipo,
            descripcion,
            autorNombre: autorNombre || 'Sistema',
            fechaCreacion: serverTimestamp()
        });
    } catch (error) {
        console.error("Error al registrar en el historial:", error);
    }
}

/**
 * Suscribe a los últimos N movimientos del historial
 */
export function subscribeToHistorial(limite = 50, callback) {
    const q = query(
        getTenantCollection(HISTORIAL_COLLECTION), 
        orderBy('fechaCreacion', 'desc'),
        limit(limite)
    );
    
    return onSnapshot(q, (snapshot) => {
        const registros = [];
        snapshot.forEach((doc) => {
            registros.push({ id: doc.id, ...doc.data() });
        });
        callback(registros);
    }, (error) => {
        console.error("Error subscribing to historial:", error);
    });
}
