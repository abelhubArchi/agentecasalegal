import { writable } from 'svelte/store';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, doc, getDoc } from '$lib/firebase/client.js';
import { collection, query, where, getDocs } from 'firebase/firestore';

function createAuthStore() {
    const { subscribe, set, update } = writable({
        user: null,
        profile: null,
        loading: true,
        error: null
    });

    let unsubscribeAuth;

    function init() {
        if (unsubscribeAuth) unsubscribeAuth();
        
        unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    let profile = null;
                    
                    // 1. Try to find in empleados first
                    const q = query(collection(db, 'empleados'), where('authUid', '==', user.uid));
                    const querySnapshot = await getDocs(q);
                    
                    if (!querySnapshot.empty) {
                        profile = querySnapshot.docs[0].data();
                    } else {
                        // 2. If not an employee, check users collection
                        const docRef = doc(db, 'users', user.uid);
                        const docSnap = await getDoc(docRef);
                        
                        if (docSnap.exists()) {
                            profile = docSnap.data();
                        }
                    }
                    
                    set({ user, profile, loading: false, error: null });
                } catch (err) {
                    console.error("Error fetching user profile:", err);
                    set({ user, profile: null, loading: false, error: err.message });
                }
            } else {
                set({ user: null, profile: null, loading: false, error: null });
            }
        });
    }

    return {
        subscribe,
        init,
        updateProfile: (newProfileData) => {
            update(state => ({ ...state, profile: { ...state.profile, ...newProfileData } }));
        }
    };
}

export const authStore = createAuthStore();
