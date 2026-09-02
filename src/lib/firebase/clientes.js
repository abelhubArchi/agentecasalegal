import { db } from './client.js';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp 
} from 'firebase/firestore';
import { registrarActividad } from './historial.js';

const CLIENTES_COLLECTION = 'clientes';

/**
 * Agrega un nuevo cliente a la base de datos
 */
export async function addCliente(clienteData) {
    try {
        const docRef = await addDoc(collection(db, CLIENTES_COLLECTION), {
            ...clienteData,
            fechaRegistro: serverTimestamp(),
            ultimaVisita: serverTimestamp(), // Track when they last visited
            visitasTotales: 1, // Track how many times they have visited
            tramiteActual: null, // No active procedure initially
            estado: 'Activo'
        });
        
        await registrarActividad(
            'Clientes',
            'Nuevo Cliente',
            `Se registró un nuevo cliente: ${clienteData.nombreCompleto}`,
            'Sistema'
        );
        
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Error al añadir cliente:", error);
        throw error;
    }
}

/**
 * Registra una nueva visita de un cliente existente
 */
export async function registrarVisita(id, currentVisits = 0, motivo = '') {
    try {
        const docRef = doc(db, CLIENTES_COLLECTION, id);
        await updateDoc(docRef, {
            ultimaVisita: serverTimestamp(),
            visitasTotales: (currentVisits || 1) + 1,
            ultimoMotivo: motivo || null
        });
        
        let desc = `El cliente se ha presentado físicamente en recepción.`;
        if (motivo) desc += ` Motivo: ${motivo}`;

        await registrarActividad(
            'Recepción',
            'Visita Física',
            desc,
            'Sistema'
        );
        
        return { success: true };
    } catch (error) {
        console.error("Error al registrar visita:", error);
        throw error;
    }
}

/**
 * Suscribe a los cambios en tiempo real de la colección de clientes

 * @param {function} callback - Función a ejecutar cuando los datos cambien
 * @returns {function} Función para desuscribirse
 */
export function subscribeToClientes(callback) {
    const q = query(collection(db, CLIENTES_COLLECTION), orderBy('ultimaVisita', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
        const clientes = [];
        snapshot.forEach((doc) => {
            clientes.push({ id: doc.id, ...doc.data() });
        });
        callback(clientes);
    }, (error) => {
        console.error("Error subscribing to clientes:", error);
    });
}

/**
 * Actualiza la información de un cliente
 */
export async function updateCliente(id, newData) {
    try {
        const docRef = doc(db, CLIENTES_COLLECTION, id);
        await updateDoc(docRef, newData);
        return { success: true };
    } catch (error) {
        console.error("Error al actualizar cliente:", error);
        throw error;
    }
}

/**
 * Archiva (o elimina lógicamente) un cliente
 */
export async function archivarCliente(id) {
    return updateCliente(id, { estado: 'Inactivo' });
}
