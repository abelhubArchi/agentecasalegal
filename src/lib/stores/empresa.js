import { writable, get } from 'svelte/store';
import { db, secondaryAuth, createUserWithEmailAndPassword, signOut } from '$lib/firebase/client.js';
import { doc, getDoc, setDoc, deleteDoc, getDocs, collection, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { getActiveTenantId, setActiveTenantId } from '$lib/firebase/tenant.js';
import { updateBrowserIcons } from '$lib/utils/imageOptimizer.js';

export const DEFAULT_EMPRESA = {
    id: 'casa_legal',
    slug: 'casa-legal',
    nombre: 'CASA LEGAL',
    subtitulo: 'Firma Jurídica e Inmobiliaria',
    eslogan: 'Excelencia, Estrategia y Seguridad Jurídica',
    logoUrl: '', // Si está vacío usa el logo por defecto
    moneda: 'Bs.',
    colorPrimario: '#006a39', // Verde esmeralda elegante
    colorSecundario: '#c5a059', // Dorado elegante
    colorFondo: '#f8f9ff',
    colorSidebar: '#1a1d1e',
    telefono: '+591 70000000',
    email: 'contacto@casalegal.bo',
    direccion: 'Av. Principal #100, Edificio Corporativo Piso 4',
    ciudad: 'Santa Cruz, Bolivia',
    nit: '1029384756',
    registroNotarial: 'Reg. Colegio de Abogados #4892',
    piePagina: 'Sistema integral de gestión jurídica y financiera. Confidencial.'
};

export const PRESETS_FIRMAS = [
    {
        id: 'casa_legal',
        nombre: 'CASA LEGAL',
        subtitulo: 'Firma Jurídica e Inmobiliaria',
        eslogan: 'Excelencia, Estrategia y Seguridad Jurídica',
        colorPrimario: '#006a39',
        colorSecundario: '#c5a059',
        colorFondo: '#f8f9ff',
        colorSidebar: '#1a1d1e',
        moneda: 'Bs.'
    },
    {
        id: 'lex_veritas',
        nombre: 'LEX & VERITAS LAW',
        subtitulo: 'Consultores Jurídicos Corporativos',
        eslogan: 'Defensa Estratégica y Asesoría Patrimonial',
        colorPrimario: '#0f2942',
        colorSecundario: '#3b82f6',
        colorFondo: '#f4f7fb',
        colorSidebar: '#0b1622',
        moneda: 'USD'
    },
    {
        id: 'valdivia_asociados',
        nombre: 'VALDIVIA & ASOCIADOS',
        subtitulo: 'Bufete de Abogados y Notaría',
        eslogan: 'Tradición, Ética y Resultados Comprobados',
        colorPrimario: '#6b1d2f',
        colorSecundario: '#d97706',
        colorFondo: '#faf6f7',
        colorSidebar: '#1c1014',
        moneda: 'Bs.'
    },
    {
        id: 'nova_juris',
        nombre: 'NOVA JURIS FINTECH',
        subtitulo: 'Legaltech & Contratos Inteligentes',
        eslogan: 'Innovación jurídica con respaldo tecnológico',
        colorPrimario: '#059669',
        colorSecundario: '#10b981',
        colorFondo: '#f0fdf4',
        colorSidebar: '#0f172a',
        moneda: '$'
    },
    {
        id: 'imperium_partners',
        nombre: 'IMPERIUM WEALTH & LAW',
        subtitulo: 'Boutique Jurídica de Alto Patrimonio',
        eslogan: 'Protección de activos familiares y comerciales',
        colorPrimario: '#854d0e',
        colorSecundario: '#eab308',
        colorFondo: '#fefce8',
        colorSidebar: '#18181b',
        moneda: 'EUR'
    }
];

export function generarSlugFirma(nombre) {
    if (!nombre) return 'nueva-firma';
    return nombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'firma';
}

function createEmpresaStore() {
    const { subscribe, set, update } = writable(DEFAULT_EMPRESA);
    let unsubscribeFirestore = null;

    function applyCssTheme(empresa) {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        if (empresa.colorPrimario) {
            root.style.setProperty('--color-primary', empresa.colorPrimario);
        }
        if (empresa.colorSecundario) {
            root.style.setProperty('--color-secondary', empresa.colorSecundario);
        }
        if (empresa.logoUrl) {
            updateBrowserIcons(empresa.logoUrl);
        }
    }

    function subscribirDoc(docRef, fallback) {
        if (unsubscribeFirestore) {
            unsubscribeFirestore();
            unsubscribeFirestore = null;
        }
        try {
            unsubscribeFirestore = onSnapshot(docRef, (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    const activeTenant = getActiveTenantId();
                    // Protección anti-contaminación: si estamos en Casa Legal (sin tenant activo)
                    // y el documento contiene datos de un clon o firma ajena, preservar Casa Legal.
                    if (!activeTenant && data?.id && data.id !== 'casa_legal' && !data.id.startsWith('casa_')) {
                        console.warn("Registro foráneo en sistema/configuracion_firma. Protegiendo Casa Legal.");
                        set(DEFAULT_EMPRESA);
                        applyCssTheme(DEFAULT_EMPRESA);
                        return;
                    }
                    const merged = { ...fallback, ...data };
                    set(merged);
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('configuracion_empresa', JSON.stringify(merged));
                    }
                    applyCssTheme(merged);
                }
            }, (err) => {
                console.warn("Error en suscripción de firma:", err);
            });
        } catch (err) {
            console.warn("No se pudo suscribir a Firestore:", err);
        }
    }

    return {
        subscribe,
        init: () => {
            if (typeof window === 'undefined') return;

            const activeTenant = getActiveTenantId();

            // 1. Cargar cache local inmediato
            try {
                const cached = localStorage.getItem('configuracion_empresa');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    // Si el cache coincide con el inquilino activo o ambos son Casa Legal
                    if ((!activeTenant && !parsed.slug) || (activeTenant && parsed.slug === activeTenant)) {
                        set(parsed);
                        applyCssTheme(parsed);
                    }
                }
            } catch (e) {
                console.warn("No se pudo leer cache de empresa", e);
            }

            // 2. Suscribirse a Firestore según el tenant activo
            if (activeTenant) {
                const docRef = doc(db, 'firmas_duplicadas', activeTenant);
                subscribirDoc(docRef, { ...DEFAULT_EMPRESA, slug: activeTenant, id: activeTenant });
            } else {
                const docRef = doc(db, 'sistema', 'configuracion_firma');
                subscribirDoc(docRef, DEFAULT_EMPRESA);
            }
        },

        /**
         * Crea una nueva firma duplicada independiente accesible vía /{slug}
         * No sobrescribe la configuración de Casa Legal.
         */
        crearFirmaDuplicada: async (firmaData, adminData) => {
            const rawSlug = firmaData.slug || generarSlugFirma(firmaData.nombre);
            const slug = rawSlug.trim().toLowerCase();

            const cleanSlugId = slug.replace(/[^a-z0-9]/g, '');
            const technicalAuthEmail = `admin_${cleanSlugId}@firma.casalegal.system`;

            const configFirma = {
                id: slug,
                slug: slug,
                nombre: firmaData.nombre || 'Nueva Firma Jurídica',
                subtitulo: firmaData.subtitulo || 'Bufete Legal & Asesoría',
                eslogan: firmaData.eslogan || 'Defensa y Estrategia Jurídica',
                logoUrl: firmaData.logoUrl || '',
                moneda: firmaData.moneda || 'Bs.',
                colorPrimario: firmaData.colorPrimario || '#006a39',
                colorSecundario: firmaData.colorSecundario || '#c5a059',
                colorFondo: firmaData.colorFondo || '#f8f9ff',
                colorSidebar: firmaData.colorSidebar || '#1a1d1e',
                telefono: firmaData.telefono || adminData?.telefono || '+591 70000000',
                email: firmaData.email || adminData?.email || `contacto@${slug}.com`,
                direccion: firmaData.direccion || 'Oficina Corporativa',
                ciudad: firmaData.ciudad || 'Santa Cruz, Bolivia',
                nit: firmaData.nit || '',
                registroNotarial: firmaData.registroNotarial || '',
                piePagina: `Portal oficial de ${firmaData.nombre}. Todos los derechos reservados.`,
                estado: 'Activa',
                fechaCreacion: new Date().toISOString(),
                administradorGeneral: {
                    nombre: adminData?.nombre || 'Administrador General',
                    cargo: adminData?.cargo || 'Socio Director',
                    email: adminData?.email || `admin@${slug}.bo`,
                    authEmail: technicalAuthEmail,
                    password: adminData?.password || 'Admin#2026',
                    telefono: adminData?.telefono || '+591 70000000'
                }
            };

            // 1. Guardar en Firestore: coleccion firmas_duplicadas/{slug}
            const docFirmaRef = doc(db, 'firmas_duplicadas', slug);
            await setDoc(docFirmaRef, configFirma, { merge: true });

            // 2. Intentar registrar el usuario Admin en Firebase Auth (secondaryAuth) para que pueda loguearse
            let authUid = null;
            if (adminData?.password) {
                const emailsToAttempt = [
                    adminData?.email ? adminData.email.trim() : null,
                    technicalAuthEmail
                ].filter(Boolean);

                for (const em of emailsToAttempt) {
                    try {
                        const userCredential = await createUserWithEmailAndPassword(
                            secondaryAuth,
                            em,
                            adminData.password
                        );
                        authUid = userCredential.user.uid;
                        await signOut(secondaryAuth);
                        break;
                    } catch (authErr) {
                        console.warn("secondaryAuth intento para", em, authErr?.message);
                    }
                }
            }

            // 3. Crear el registro del empleado Administrador en la subcolección de la firma
            // Y opcionalmente en la colección raíz con empresaId para facilitar login
            try {
                const adminDocData = {
                    nombre: adminData?.nombre || 'Administrador General',
                    cargo: adminData?.cargo || 'Socio Director',
                    email: adminData?.email || `admin@${slug}.bo`,
                    telefono: adminData?.telefono || '',
                    rol: 'Administrador',
                    nivelAcceso: 'admin',
                    empresaId: slug,
                    empresaSlug: slug,
                    empresaNombre: configFirma.nombre,
                    fechaRegistro: serverTimestamp(),
                    estado: 'Activo'
                };
                if (authUid) {
                    adminDocData.authUid = authUid;
                }

                // Guardar en la subcolección aislada de la firma
                const empSubRef = doc(db, 'firmas_duplicadas', slug, 'empleados', 'admin_principal');
                await setDoc(empSubRef, adminDocData, { merge: true });

                // También guardar en root empleados con empresaId para reconocimiento universal
                const empRootRef = doc(db, 'empleados', `admin_${slug}`);
                await setDoc(empRootRef, adminDocData, { merge: true });
            } catch (empErr) {
                console.warn("Error guardando admin de la firma:", empErr);
            }

            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            const dedicatedUrl = `${origin}/${slug}`;
            const directAdminLink = `${origin}/${slug}?loginEmail=${encodeURIComponent(adminData?.email || '')}`;

            return {
                success: true,
                slug,
                firma: configFirma,
                url: dedicatedUrl,
                directAdminLink
            };
        },

        /**
         * Carga una firma específica por su slug (para /{slug})
         */
        cargarFirmaPorSlug: async (slug) => {
            if (!slug) return null;
            const cleanSlug = slug.trim().toLowerCase();
            try {
                const docRef = doc(db, 'firmas_duplicadas', cleanSlug);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    const merged = { ...DEFAULT_EMPRESA, ...data, slug: cleanSlug };
                    set(merged);
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('configuracion_empresa', JSON.stringify(merged));
                    }
                    applyCssTheme(merged);
                    return merged;
                }
            } catch (err) {
                console.warn("Error cargando firma por slug:", cleanSlug, err);
            }
            return null;
        },

        /**
         * Activa una firma duplicada en el navegador actual
         */
        activarFirma: async (slug) => {
            if (!slug || slug === 'casa-legal' || slug === 'default') {
                setActiveTenantId(null);
            } else {
                setActiveTenantId(slug);
            }
            if (typeof window !== 'undefined') {
                window.location.reload();
            }
        },

        /**
         * Restaura la configuración a Casa Legal Master
         */
        restaurarCasaLegal: () => {
            setActiveTenantId(null);
            if (typeof window !== 'undefined') {
                localStorage.removeItem('current_tenant_slug');
                localStorage.removeItem('configuracion_empresa');
                window.location.reload();
            }
        },

        /**
         * Restablece forzosamente la identidad maestra de Casa Legal en Firestore
         * asegurando que jamás se mezcle o pierda con firmas clonadas
         */
        restablecerCasaLegalConfig: async () => {
            setActiveTenantId(null);
            if (typeof window !== 'undefined') {
                localStorage.removeItem('current_tenant_slug');
                localStorage.removeItem('configuracion_empresa');
            }
            try {
                const docRef = doc(db, 'sistema', 'configuracion_firma');
                await setDoc(docRef, DEFAULT_EMPRESA);
            } catch (err) {
                console.warn("Error restableciendo en Firestore:", err);
            }
            set(DEFAULT_EMPRESA);
            applyCssTheme(DEFAULT_EMPRESA);
            return DEFAULT_EMPRESA;
        },

        /**
         * Lista todas las firmas duplicadas registradas
         */
        listarFirmasDuplicadas: async () => {
            try {
                const colRef = collection(db, 'firmas_duplicadas');
                const snap = await getDocs(colRef);
                const firmas = [];
                snap.forEach(d => {
                    firmas.push({ id: d.id, ...d.data() });
                });
                return firmas;
            } catch (err) {
                console.warn("Error listando firmas duplicadas:", err);
                return [];
            }
        },

        /**
         * Elimina una firma duplicada
         */
        eliminarFirmaDuplicada: async (slug) => {
            if (!slug) return { success: false };
            try {
                const docRef = doc(db, 'firmas_duplicadas', slug);
                await deleteDoc(docRef);
                return { success: true };
            } catch (err) {
                console.error("Error eliminando firma duplicada:", err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Guarda configuración: si hay un tenant activo guarda en firmas_duplicadas/{slug},
         * si es Casa Legal guarda en sistema/configuracion_firma.
         */
        guardarConfiguracion: async (nuevaConfig) => {
            const activeTenant = getActiveTenantId();
            const merged = { ...DEFAULT_EMPRESA, ...nuevaConfig };
            set(merged);
            if (typeof window !== 'undefined') {
                localStorage.setItem('configuracion_empresa', JSON.stringify(merged));
                applyCssTheme(merged);
            }
            try {
                if (activeTenant) {
                    const docRef = doc(db, 'firmas_duplicadas', activeTenant);
                    await setDoc(docRef, merged, { merge: true });
                } else {
                    const docRef = doc(db, 'sistema', 'configuracion_firma');
                    await setDoc(docRef, merged, { merge: true });
                }
            } catch (err) {
                console.warn("No se pudo guardar en Firestore:", err);
            }
            return merged;
        },

        aplicarPreset: (presetId) => {
            const preset = PRESETS_FIRMAS.find(p => p.id === presetId);
            if (!preset) return;
            update(curr => {
                const updated = {
                    ...curr,
                    nombre: preset.nombre,
                    subtitulo: preset.subtitulo,
                    eslogan: preset.eslogan,
                    colorPrimario: preset.colorPrimario,
                    colorSecundario: preset.colorSecundario,
                    colorFondo: preset.colorFondo,
                    colorSidebar: preset.colorSidebar,
                    moneda: preset.moneda
                };
                if (typeof window !== 'undefined') {
                    localStorage.setItem('configuracion_empresa', JSON.stringify(updated));
                    applyCssTheme(updated);
                }
                return updated;
            });
        },

        exportarConfiguracionJSON: () => {
            const data = get({ subscribe });
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `app_duplicada_${(data.nombre || 'firma').toLowerCase().replace(/\s+/g, '_')}_config.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        },

        importarConfiguracionJSON: async (jsonString) => {
            try {
                const parsed = JSON.parse(jsonString);
                const activeTenant = getActiveTenantId();
                const merged = { ...DEFAULT_EMPRESA, ...parsed };
                set(merged);
                if (typeof window !== 'undefined') {
                    localStorage.setItem('configuracion_empresa', JSON.stringify(merged));
                    applyCssTheme(merged);
                }
                try {
                    if (activeTenant) {
                        const docRef = doc(db, 'firmas_duplicadas', activeTenant);
                        await setDoc(docRef, merged, { merge: true });
                    } else {
                        const docRef = doc(db, 'sistema', 'configuracion_firma');
                        await setDoc(docRef, merged, { merge: true });
                    }
                } catch (e) {}
                return { success: true };
            } catch (err) {
                console.error("JSON inválido:", err);
                return { success: false, error: err.message };
            }
        },

        destroy: () => {
            if (unsubscribeFirestore) unsubscribeFirestore();
        }
    };
}

export const empresaStore = createEmpresaStore();
