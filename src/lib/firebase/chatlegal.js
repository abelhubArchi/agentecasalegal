import { db, storage } from './client.js';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    getDoc,
    query, 
    where, 
    orderBy, 
    onSnapshot,
    serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const CHAT_COLLECTION = 'chat_legal';
const SECRETOS_COLLECTION = 'secretos_antiespia';

/**
 * Escucha los mensajes entre el usuario actual y el receptor seleccionado
 */
export function subscribeToMessages(userId, receptorId, callback) {
    if (!userId || !receptorId) return () => {};

    // Sin orderBy para no exigir índices compuestos en Firestore y funcionar al 100% de inmediato
    const q1 = query(
        collection(db, CHAT_COLLECTION),
        where('emisorId', '==', userId)
    );
    
    const q2 = query(
        collection(db, CHAT_COLLECTION),
        where('receptorId', '==', userId)
    );

    let messages1 = [];
    let messages2 = [];

    const handleUpdate = () => {
        const allMessages = [...messages1, ...messages2]
            .filter((msg, index, self) => index === self.findIndex((m) => m.id === msg.id))
            .filter(msg => 
                (msg.emisorId === userId && msg.receptorId === receptorId) ||
                (msg.emisorId === receptorId && msg.receptorId === userId)
            )
            .sort((a, b) => {
                const timeA = a.fechaEnvio?.toMillis ? a.fechaEnvio.toMillis() : (a.fechaEnvio?.getTime ? a.fechaEnvio.getTime() : (a._localTimestamp || 0));
                const timeB = b.fechaEnvio?.toMillis ? b.fechaEnvio.toMillis() : (b.fechaEnvio?.getTime ? b.fechaEnvio.getTime() : (b._localTimestamp || 0));
                return timeA - timeB;
            });
        callback(allMessages);
    };

    const unsub1 = onSnapshot(q1, (snapshot) => {
        messages1 = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        handleUpdate();
    }, (err) => console.warn("Error snapshot chat1:", err));

    const unsub2 = onSnapshot(q2, (snapshot) => {
        messages2 = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        handleUpdate();
    }, (err) => console.warn("Error snapshot chat2:", err));

    return () => {
        unsub1();
        unsub2();
    };
}

export async function sendMessage(texto, imageUrl, emisorId, receptorId, isPVD, opcionesAntiEspia = {}) {
    try {
        const docData = {
            texto: texto || '',
            imageUrl: imageUrl || null,
            emisorId,
            receptorId,
            isPVD: !!isPVD,
            leido: false,
            cifradoLocal: opcionesAntiEspia.cifradoLocal || false,
            tiempoAutoDestruccion: opcionesAntiEspia.tiempoAutoDestruccion || (isPVD ? 2 : null),
            fechaEnvio: serverTimestamp(),
            _localTimestamp: Date.now()
        };
        const docRef = await addDoc(collection(db, CHAT_COLLECTION), docData);
        return { success: true, id: docRef.id, ...docData };
    } catch (error) {
        console.error("Error sending message:", error);
        throw error;
    }
}

export async function markAsRead(mensajeId, isPVD, imageUrl = null, tiempoDestruccion = 2000) {
    try {
        const docRef = doc(db, CHAT_COLLECTION, mensajeId);
        await updateDoc(docRef, { leido: true });

        // Autodestrucción si es efímero
        if (isPVD) {
            setTimeout(() => {
                deleteMessage(mensajeId, imageUrl);
            }, tiempoDestruccion);
        }
        return { success: true };
    } catch (error) {
        console.error("Error marking as read:", error);
    }
}

export async function deleteMessage(mensajeId, imageUrl = null) {
    try {
        await deleteDoc(doc(db, CHAT_COLLECTION, mensajeId));
        if (imageUrl) {
            try {
                const pathRegex = /o\/(.*?)\?alt=/;
                const match = imageUrl.match(pathRegex);
                if (match && match[1]) {
                    const filePath = decodeURIComponent(match[1]);
                    const imageRef = ref(storage, filePath);
                    await deleteObject(imageRef);
                }
            } catch (err) {
                console.error("Error deleting image from storage:", err);
            }
        }
    } catch (error) {
        console.error("Error deleting message:", error);
    }
}

export async function uploadChatImage(file) {
    if (!file) return null;
    const fileName = `chatlegal/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, fileName);
    
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
}

// ========================================================
// SISTEMA DEAD DROP / ANTI-ESPÍA / HONEYPOT TELEMETRY
// ========================================================

/**
 * Sube un archivo confidencial (Audio, Imagen, PDF o Documento) para el Enlace Seguro
 */
export async function uploadDeadDropFile(file) {
    if (!file) return null;
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `secretos/${Date.now()}_${sanitizedName}`;
    const storageRef = ref(storage, fileName);
    
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return {
        url,
        nombre: file.name,
        tipo: file.type || 'application/octet-stream',
        size: file.size
    };
}

/**
 * Crea un Dead Drop efímero autodestructible con rastreo forense de dispositivo.
 */
export async function crearSecretoAntiEspia({
    texto = '',
    archivo = null,
    tiempoSegundos = 10,
    clavePin = '',
    emisorUid,
    emisorNombre,
    emisorEmail = '',
    destinatarioEmail = '',
    destinatarioNombre = '',
    titulo = 'Comprobante / Documento Judicial Reservado'
}) {
    try {
        const pinLimpio = (clavePin && typeof clavePin === 'string') ? clavePin.trim() : '';
        const tienePinReal = pinLimpio.length > 0;

        const nuevoDoc = {
            titulo,
            texto: texto || '',
            archivoUrl: archivo?.url || null,
            archivoNombre: archivo?.nombre || null,
            archivoTipo: archivo?.tipo || null,
            archivoSize: archivo?.size || null,
            tiempoSegundos: Number(tiempoSegundos) || 10,
            clavePin: tienePinReal ? pinLimpio : null,
            tienePin: tienePinReal,
            emisorUid: emisorUid || 'anonimo',
            emisorNombre: emisorNombre || 'Abogado de la Firma',
            emisorEmail: emisorEmail || null,
            destinatarioEmail: destinatarioEmail || null,
            destinatarioNombre: destinatarioNombre || null,
            creadoEn: serverTimestamp(),
            estado: 'ACTIVO_PENDIENTE', // 'ACTIVO_PENDIENTE' | 'INTERCEPTADO' | 'DESTRUIDO'
            visto: false,
            fechaApertura: null,
            fechaDestruccion: null,
            destruido: false,
            datosDispositivo: null
        };

        const docRef = await addDoc(collection(db, SECRETOS_COLLECTION), nuevoDoc);
        return {
            id: docRef.id,
            ...nuevoDoc
        };
    } catch (error) {
        console.error("Error al crear secreto anti-espía:", error);
        throw error;
    }
}

/**
 * Obtiene los metadatos de un secreto antes de ser revelado
 */
export async function obtenerSecretoPorId(secretoId) {
    try {
        const docRef = doc(db, SECRETOS_COLLECTION, secretoId);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return null;
        return { id: docSnap.id, ...docSnap.data() };
    } catch (error) {
        console.error("Error obteniendo secreto:", error);
        return null;
    }
}

/**
 * Rescata la telemetría forense del dispositivo que abrió el link y la guarda en tiempo real
 */
export async function registrarAccesoYRescateForense(secretoId, telemetria) {
    try {
        const docRef = doc(db, SECRETOS_COLLECTION, secretoId);
        await updateDoc(docRef, {
            visto: true,
            estado: 'INTERCEPTADO',
            fechaApertura: serverTimestamp(),
            datosDispositivo: telemetria
        });
        return { success: true };
    } catch (error) {
        console.error("Error registrando telemetría:", error);
    }
}

/**
 * Purga y destruye permanentemente el secreto una vez que expira el temporizador (3s, 10s, etc.)
 */
export async function purgarSecretoDefinitivo(secretoId) {
    try {
        const docRef = doc(db, SECRETOS_COLLECTION, secretoId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            if (data.archivoUrl) {
                try {
                    const pathRegex = /o\/(.*?)\?alt=/;
                    const match = data.archivoUrl.match(pathRegex);
                    if (match && match[1]) {
                        const filePath = decodeURIComponent(match[1]);
                        const fileRef = ref(storage, filePath);
                        await deleteObject(fileRef);
                    }
                } catch (err) {
                    console.warn("Archivo en storage ya eliminado o no encontrado:", err);
                }
            }
        }

        await updateDoc(docRef, {
            texto: '[CARGA ÚTIL PURGADA Y DESTRUIDA - ZERO TRACE]',
            archivoUrl: null,
            destruido: true,
            estado: 'DESTRUIDO',
            fechaDestruccion: serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        console.error("Error purgando secreto:", error);
    }
}

/**
 * Suscribe a los secretos generados por el emisor para ver en vivo la intercepción forense
 */
export function subscribeToSecretosGenerados(emisorUid, callback) {
    if (!emisorUid) return () => {};
    
    // Sin orderBy en Firestore para evitar fallo por falta de índice compuesto
    const q = query(
        collection(db, SECRETOS_COLLECTION),
        where('emisorUid', '==', emisorUid)
    );

    return onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        docs.sort((a, b) => {
            const timeA = a.creadoEn?.toMillis ? a.creadoEn.toMillis() : (a.creadoEn?.getTime ? a.creadoEn.getTime() : 0);
            const timeB = b.creadoEn?.toMillis ? b.creadoEn.toMillis() : (b.creadoEn?.getTime ? b.creadoEn.getTime() : 0);
            return timeB - timeA;
        });
        callback(docs);
    }, (err) => {
        console.warn("Error snapshot secretos:", err);
    });
}
