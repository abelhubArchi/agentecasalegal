import { writable } from 'svelte/store';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, doc, getDoc } from '$lib/firebase/client.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { setActiveTenantId } from '$lib/firebase/tenant.js';
import { empresaStore } from './empresa.js';

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
                    
                    // 1. Try to find in root empleados first
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

                    // Aislamiento Multi-Tenant estricto:
                    // Si el usuario pertenece a una firma clonada (empresaId / empresaSlug), activar su espacio aislado.
                    // Si el usuario pertenece a Casa Legal (sin empresaId o es 'casa_legal'), fijar tenant a null (Master).
                    const userTenant = profile?.empresaId || profile?.empresaSlug;
                    if (userTenant && userTenant !== 'casa_legal' && userTenant !== 'casa-legal' && userTenant !== 'default') {
                        setActiveTenantId(userTenant);
                    } else {
                        setActiveTenantId(null);
                    }
                    empresaStore.init();
                    
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
