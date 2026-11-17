import { db } from './client.js';
import { collection, doc } from 'firebase/firestore';

/**
 * Obtiene el slug de la firma / inquilino actualmente activo.
 * Si es null, undefined, 'default' o 'casa_legal', opera en el espacio maestro de Casa Legal.
 * Si tiene un slug (ej: 'laempresajuridica'), opera en la colección aislada de esa firma.
 */
export function getActiveTenantId() {
    if (typeof window === 'undefined') return null;
    try {
        const stored = localStorage.getItem('current_tenant_slug');
        if (stored && stored !== 'default' && stored !== 'casa_legal' && stored.trim() !== '') {
            return stored.trim();
        }
    } catch (e) {
        console.warn("Error leyendo current_tenant_slug:", e);
    }
    return null;
}

/**
 * Establece la firma / inquilino activo en el navegador.
 */
export function setActiveTenantId(slug) {
    if (typeof window === 'undefined') return;
    try {
        if (!slug || slug === 'default' || slug === 'casa_legal') {
            localStorage.removeItem('current_tenant_slug');
        } else {
            localStorage.setItem('current_tenant_slug', slug.trim());
        }
    } catch (e) {
        console.warn("Error guardando current_tenant_slug:", e);
    }
}

/**
 * Devuelve la referencia a una colección scoped para el inquilino activo.
 * Si tenantId está activo: db/firmas_duplicadas/{tenantId}/{colName}
 * Si tenantId es null (Casa Legal): db/{colName}
 */
export function getTenantCollection(colName) {
    const tenantId = getActiveTenantId();
    if (tenantId) {
        return collection(db, 'firmas_duplicadas', tenantId, colName);
    }
    return collection(db, colName);
}

/**
 * Devuelve la referencia a un documento scoped para el inquilino activo.
 * Si tenantId está activo: db/firmas_duplicadas/{tenantId}/{colName}/{docId}
 * Si tenantId es null (Casa Legal): db/{colName}/{docId}
 */
export function getTenantDoc(colName, docId) {
    const tenantId = getActiveTenantId();
    if (tenantId) {
        return doc(db, 'firmas_duplicadas', tenantId, colName, docId);
    }
    return doc(db, colName, docId);
}
