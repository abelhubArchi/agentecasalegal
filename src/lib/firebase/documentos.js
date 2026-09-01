import { db, storage } from './client.js';
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
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { registrarActividad } from './historial.js';

const DOCUMENTOS_COLLECTION = 'documentos';

/**
 * Sube un archivo a Firebase Storage y guarda sus metadatos en Firestore
 */
export async function uploadDocumento(file, metadata) {
    try {
        // 1. Upload to Storage
        const timestamp = Date.now();
        const fileExtension = file.name.split('.').pop();
        const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        // Clean filename
        const safeName = fileNameWithoutExt.replace(/[^a-zA-Z0-9-]/g, '_');
        const storageRef = ref(storage, `boveda/${metadata.creadoPor}/${safeName}_${timestamp}.${fileExtension}`);
        
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);

        // 2. Save metadata to Firestore
        const payload = {
            nombreOriginal: file.name || 'documento',
            tipoArchivo: file.type || fileExtension || 'unknown',
            tamanoBytes: file.size || 0,
            url: downloadUrl || '',
            storagePath: storageRef.fullPath || '',
            creadoPor: metadata.creadoPor || 'desconocido', // authUid of the uploader
            fechaSubida: serverTimestamp(),
            // Permissions: 'Publico', 'Privado', 'Compartido'
            permisoVisualizacion: metadata.permisoVisualizacion || 'Publico',
            compartidoCon: metadata.compartidoCon || [], // Array of uids if 'Compartido'
            // Relationships
            clienteId: metadata.clienteId || null,
            casoId: metadata.casoId || null,
            // Tags array
            etiquetas: metadata.etiquetas || [],
            // AI Placeholder
            ia_procesado: false,
            ia_resumen: null,
            ia_riesgos: [],
            ia_entidades: {}
        };

        // Extra safety: remove any keys that resolved to undefined
        Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

        const docRef = await addDoc(collection(db, DOCUMENTOS_COLLECTION), payload);

        await registrarActividad(
            'Bóveda Documental',
            'Nuevo Documento',
            `Se subió el documento: ${file.name}`,
            metadata.creadoPor || 'Sistema'
        );

        return { success: true, id: docRef.id, url: downloadUrl };
    } catch (error) {
        console.error("Error al subir documento:", error);
        throw error;
    }
}

/**
 * Suscribe a los documentos
 */
export function subscribeToDocumentos(callback) {
    const q = query(collection(db, DOCUMENTOS_COLLECTION), orderBy('fechaSubida', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
        const documentos = [];
        snapshot.forEach((doc) => {
            documentos.push({ id: doc.id, ...doc.data() });
        });
        callback(documentos);
    }, (error) => {
        console.error("Error subscribing to documentos:", error);
    });
}

/**
 * Actualiza etiquetas o permisos de un documento
 */
export async function updateDocumento(id, newData) {
    try {
        const docRef = doc(db, DOCUMENTOS_COLLECTION, id);
        await updateDoc(docRef, newData);
        return { success: true };
    } catch (error) {
        console.error("Error al actualizar documento:", error);
        throw error;
    }
}

/**
 * Elimina un documento (de Firestore y Storage)
 */
export async function deleteDocumento(id, storagePath) {
    try {
        // Delete from Storage
        if (storagePath) {
            const fileRef = ref(storage, storagePath);
            await deleteObject(fileRef).catch(e => console.warn("Archivo ya no existe en storage", e));
        }
        
        // Delete from Firestore
        await deleteDoc(doc(db, DOCUMENTOS_COLLECTION, id));
        return { success: true };
    } catch (error) {
        console.error("Error al eliminar documento:", error);
        throw error;
    }
}
