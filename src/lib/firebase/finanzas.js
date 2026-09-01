import { db, storage } from './client.js';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { registrarActividad } from './historial.js';

const transaccionesCollection = collection(db, 'transacciones');
const contratosCollection = collection(db, 'contratos_recurrentes');

export function subscribeToTransacciones(callback) {
    const q = query(transaccionesCollection, orderBy('fechaHora', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const transacciones = [];
        snapshot.forEach((doc) => {
            transacciones.push({ id: doc.id, ...doc.data() });
        });
        callback(transacciones);
    });
}

export async function addTransaccion(transaccionData) {
    const res = await addDoc(transaccionesCollection, {
        ...transaccionData,
        createdAt: new Date()
    });
    
    await registrarActividad(
        'Finanzas',
        transaccionData.tipo === 'ingreso' ? 'Nuevo Ingreso' : 'Nuevo Gasto',
        `Se registró un ${transaccionData.tipo} por $${transaccionData.monto}: ${transaccionData.concepto}`,
        transaccionData.creadoPor || 'Sistema'
    );
    
    return res;
}

export async function updateTransaccion(id, transaccionData) {
    const docRef = doc(db, 'transacciones', id);
    return await updateDoc(docRef, transaccionData);
}

export async function deleteTransaccion(id) {
    const docRef = doc(db, 'transacciones', id);
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
    const q = query(contratosCollection, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        const contratos = [];
        snapshot.forEach((doc) => {
            contratos.push({ id: doc.id, ...doc.data() });
        });
        callback(contratos);
    });
}

export async function addContratoRecurrente(contratoData) {
    return await addDoc(contratosCollection, {
        ...contratoData,
        createdAt: new Date()
    });
}
