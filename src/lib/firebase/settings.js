import { db } from './client.js';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';

const SETTINGS_COLLECTION = 'sistema';
const CASOS_DOC = 'configuracion_casos';

/**
 * Suscribe a los cambios de configuración de los casos (columnas, etc)
 */
export function subscribeToCasosSettings(callback) {
    const docRef = doc(db, SETTINGS_COLLECTION, CASOS_DOC);
    
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data());
        } else {
            // Default configuration if doesn't exist
            const defaultSettings = {
                columnas: ['Pendiente Docs', 'En Proceso', 'Adentro', 'Finalizado']
            };
            // Try to create it (might fail if rules restrict it, but let's assume admin has access or it will just return default in UI)
            setDoc(docRef, defaultSettings).catch(console.error);
            callback(defaultSettings);
        }
    }, (error) => {
        console.error("Error subscribing to settings:", error);
    });
}

/**
 * Actualiza la configuración de los casos
 */
export async function updateCasosSettings(newData) {
    try {
        const docRef = doc(db, SETTINGS_COLLECTION, CASOS_DOC);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
            await setDoc(docRef, newData);
        } else {
            await updateDoc(docRef, newData);
        }
        return { success: true };
    } catch (error) {
        console.error("Error al actualizar configuración:", error);
        throw error;
    }
}
