import { writable } from 'svelte/store';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, doc, getDoc } from '$lib/firebase/client.js';

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
                    // Fetch user profile from Firestore to see if they have chosen a guide
                    const docRef = doc(db, 'users', user.uid);
                    const docSnap = await getDoc(docRef);
                    
                    let profile = null;
                    if (docSnap.exists()) {
                        profile = docSnap.data();
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
