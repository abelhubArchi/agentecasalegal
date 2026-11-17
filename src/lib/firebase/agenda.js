import { db } from './client.js';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    doc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp 
} from 'firebase/firestore';
import { getTenantCollection, getTenantDoc } from './tenant.js';

const AGENDA_COLLECTION = 'agenda';

export async function addEvento(data) {
    try {
        const docRef = await addDoc(getTenantCollection(AGENDA_COLLECTION), {
            ...data,
            fechaCreacion: serverTimestamp()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Error al añadir evento:", error);
        throw error;
    }
}

export function subscribeToAgenda(callback) {
    const q = query(getTenantCollection(AGENDA_COLLECTION), orderBy('fechaHora', 'asc'));
    
    return onSnapshot(q, (snapshot) => {
        const eventos = [];
        snapshot.forEach((doc) => {
            eventos.push({ id: doc.id, ...doc.data() });
        });
        callback(eventos);
    }, (error) => {
        console.error("Error al suscribirse a la agenda:", error);
    });
}

export async function updateEvento(id, data) {
    try {
        const docRef = getTenantDoc(AGENDA_COLLECTION, id);
        await updateDoc(docRef, data);
        return { success: true };
    } catch (error) {
        console.error("Error al actualizar evento:", error);
        throw error;
    }
}

export async function deleteEvento(id) {
    try {
        await deleteDoc(getTenantDoc(AGENDA_COLLECTION, id));
        return { success: true };
    } catch (error) {
        console.error("Error al eliminar evento:", error);
        throw error;
    }
}
