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
import { getTenantCollection, getTenantDoc, getActiveTenantId } from './tenant.js';

const EMPLEADOS_COLLECTION = 'empleados';

export async function addEmpleado(data) {
    try {
        const tenantId = getActiveTenantId();
        const payload = {
            ...data,
            fechaRegistro: serverTimestamp(),
            estado: 'Activo'
        };
        if (tenantId) {
            payload.empresaId = tenantId;
        }

        const docRef = await addDoc(getTenantCollection(EMPLEADOS_COLLECTION), payload);
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Error al añadir empleado:", error);
        throw error;
    }
}

export function subscribeToEmpleados(callback) {
    const q = query(getTenantCollection(EMPLEADOS_COLLECTION), orderBy('fechaRegistro', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
        const empleados = [];
        snapshot.forEach((doc) => {
            empleados.push({ id: doc.id, ...doc.data() });
        });
        callback(empleados);
    }, (error) => {
        console.error("Error al suscribirse a empleados:", error);
    });
}

export async function updateEmpleado(id, data) {
    try {
        const docRef = getTenantDoc(EMPLEADOS_COLLECTION, id);
        await updateDoc(docRef, data);
        return { success: true };
    } catch (error) {
        console.error("Error al actualizar empleado:", error);
        throw error;
    }
}

export async function deleteEmpleado(id) {
    try {
        await deleteDoc(getTenantDoc(EMPLEADOS_COLLECTION, id));
        return { success: true };
    } catch (error) {
        console.error("Error al eliminar empleado:", error);
        throw error;
    }
}
