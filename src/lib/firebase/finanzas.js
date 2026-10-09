import { db, storage } from './client.js';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, orderBy, where, getDocs, getAggregateFromServer, sum, limit as fsLimit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { registrarActividad } from './historial.js';

const transaccionesCollection = collection(db, 'transacciones');
const contratosCollection = collection(db, 'contratos_recurrentes');

export function subscribeToTransacciones(limiteOrCallback, callbackOpt) {
    let limite = 50;
    let callback;
    if (typeof limiteOrCallback === 'function') {
        callback = limiteOrCallback;
    } else {
        limite = limiteOrCallback;
        callback = callbackOpt;
    }
    
    const q = query(transaccionesCollection, orderBy('fechaHora', 'desc'), fsLimit(limite));
    return onSnapshot(q, (snapshot) => {
        const transacciones = [];
        snapshot.forEach((doc) => {
            transacciones.push({ id: doc.id, ...doc.data() });
        });
        callback(transacciones);
    });
}

export async function getTotales(filtroUid = null) {
    let qIngresos = query(transaccionesCollection, where('tipo', '==', 'Ingreso'));
    let qEgresos = query(transaccionesCollection, where('tipo', '==', 'Egreso'));
    
    if (filtroUid && filtroUid !== 'todos') {
        qIngresos = query(transaccionesCollection, where('tipo', '==', 'Ingreso'), where('creadoPor', '==', filtroUid));
        qEgresos = query(transaccionesCollection, where('tipo', '==', 'Egreso'), where('creadoPor', '==', filtroUid));
    }
    
    try {
        const snapI = await getAggregateFromServer(qIngresos, { total: sum('monto') });
        const snapE = await getAggregateFromServer(qEgresos, { total: sum('monto') });
        return {
            ingresos: snapI.data().total || 0,
            egresos: snapE.data().total || 0
        };
    } catch (e) {
        console.warn("Falta índice compuesto. Calculando totales localmente...", e);
        const snapshot = await getDocs(collection(db, 'transacciones'));
        let ingresos = 0;
        let egresos = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (filtroUid && filtroUid !== 'todos' && data.creadoPor !== filtroUid) return;
            if (data.tipo === 'Ingreso') ingresos += (data.monto || 0);
            if (data.tipo === 'Egreso') egresos += (data.monto || 0);
        });
        return { ingresos, egresos };
    }
}

export async function getTransaccionesPorRango(inicio, fin, filtroUid = null) {
    let restricciones = [
        where('fechaHora', '>=', inicio),
        where('fechaHora', '<=', fin),
        orderBy('fechaHora', 'asc')
    ];
    
    const q = query(transaccionesCollection, ...restricciones);
    const snapshot = await getDocs(q);
    const resultados = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (filtroUid && filtroUid !== 'todos' && data.creadoPor !== filtroUid) return;
        resultados.push({id: doc.id, ...data});
    });
    return resultados;
}

export async function addTransaccion(transaccionData) {
    const res = await addDoc(transaccionesCollection, {
        ...transaccionData,
        createdAt: new Date()
    });
    
    await registrarActividad(
        'Finanzas',
        transaccionData.tipo === 'ingreso' ? 'Nuevo Ingreso' : 'Nuevo Gasto',
        `Se registró un ${transaccionData.tipo} por Bs. ${transaccionData.monto}: ${transaccionData.concepto}`,
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
