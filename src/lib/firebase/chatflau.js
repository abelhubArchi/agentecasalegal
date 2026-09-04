import { db, storage } from './client.js';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    query, 
    where, 
    orderBy, 
    onSnapshot,
    serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const CHAT_COLLECTION = 'chat_flau';

/**
 * Escucha los mensajes entre el usuario actual y el receptor seleccionado (o todos si receptor es null/grupo).
 * Para un chat privado 1 a 1, filtramos por (emisor==A y receptor==B) OR (emisor==B y receptor==A).
 */
export function subscribeToMessages(userId, receptorId, callback) {
    if (!userId || !receptorId) return () => {};

    // Firestore doesn't support complex OR queries easily without multiple indexes, 
    // so we'll fetch all messages where userId is either emisor or receptor, 
    // then filter them locally for receptorId to ensure real-time speed without complex indexes.
    const q1 = query(
        collection(db, CHAT_COLLECTION),
        where('emisorId', '==', userId),
        orderBy('fechaEnvio', 'asc')
    );
    
    const q2 = query(
        collection(db, CHAT_COLLECTION),
        where('receptorId', '==', userId),
        orderBy('fechaEnvio', 'asc')
    );

    let messages1 = [];
    let messages2 = [];

    const handleUpdate = () => {
        // Merge and sort
        const allMessages = [...messages1, ...messages2]
            .filter((msg, index, self) => index === self.findIndex((m) => m.id === msg.id)) // remove duplicates if any
            .filter(msg => (msg.emisorId === receptorId) || (msg.receptorId === receptorId)) // Filter for the specific chat
            .sort((a, b) => {
                const dateA = a.fechaEnvio?.toMillis ? a.fechaEnvio.toMillis() : 0;
                const dateB = b.fechaEnvio?.toMillis ? b.fechaEnvio.toMillis() : 0;
                return dateA - dateB;
            });
        callback(allMessages);
    };

    const unsub1 = onSnapshot(q1, (snapshot) => {
        messages1 = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        handleUpdate();
    });

    const unsub2 = onSnapshot(q2, (snapshot) => {
        messages2 = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        handleUpdate();
    });

    return () => {
        unsub1();
        unsub2();
    };
}

export async function sendMessage(texto, imageUrl, emisorId, receptorId, isPVD) {
    try {
        await addDoc(collection(db, CHAT_COLLECTION), {
            texto: texto || '',
            imageUrl: imageUrl || null,
            emisorId,
            receptorId,
            isPVD,
            leido: false,
            fechaEnvio: serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        console.error("Error sending message:", error);
        throw error;
    }
}

export async function markAsRead(mensajeId, isPVD, imageUrl = null) {
    try {
        const docRef = doc(db, CHAT_COLLECTION, mensajeId);
        await updateDoc(docRef, { leido: true });

        // If PVD mode is on, trigger self-destruct after 2 seconds
        if (isPVD) {
            setTimeout(() => {
                deleteMessage(mensajeId, imageUrl);
            }, 2000);
        }
        return { success: true };
    } catch (error) {
        console.error("Error marking as read:", error);
    }
}

export async function deleteMessage(mensajeId, imageUrl = null) {
    try {
        await deleteDoc(doc(db, CHAT_COLLECTION, mensajeId));
        // Delete image from storage if exists
        if (imageUrl) {
            try {
                // Extract path from URL (naive approach, assumes standard firebase storage url)
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
    const fileName = `chatflau/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, fileName);
    
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
}
