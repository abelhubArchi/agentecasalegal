import { db } from './client.js';
import { 
    collection, 
    onSnapshot, 
    doc, 
    setDoc, 
    updateDoc, 
    getDocs, 
    serverTimestamp 
} from 'firebase/firestore';
import { getTenantCollection, getTenantDoc } from './tenant.js';

const INVENTARIO_COLLECTION = 'inventario_suministros';

export const INVENTARIO_INICIAL = [
    {
        id: 'inv-timbres-judiciales',
        nombre: 'Timbres Judiciales y Notariales',
        codigo: 'TIM-101',
        categoria: 'Valores Legales',
        stockActual: 18,
        stockMinimo: 80,
        stockOptimo: 250,
        consumoDiarioPromedio: 6.2, // ~3 días de cobertura
        costoUnitario: 25,
        unidad: 'unidades',
        proveedor: 'Consejo de la Magistratura',
        diasEntregaProveedor: 3
    },
    {
        id: 'inv-carpetas-expediente',
        nombre: 'Carpetas de Expediente Legal y Foliación',
        codigo: 'CARP-202',
        categoria: 'Papelería Forense',
        stockActual: 32,
        stockMinimo: 60,
        stockOptimo: 200,
        consumoDiarioPromedio: 5.5, // ~6 días de cobertura
        costoUnitario: 18,
        unidad: 'carpetas',
        proveedor: 'Imprenta Judicial Central',
        diasEntregaProveedor: 2
    },
    {
        id: 'inv-hojas-protocolo',
        nombre: 'Hojas Protocolizadas con Marca de Agua',
        codigo: 'HOJ-303',
        categoria: 'Documentos Oficiales',
        stockActual: 110,
        stockMinimo: 100,
        stockOptimo: 400,
        consumoDiarioPromedio: 7.0, // ~15 días de cobertura
        costoUnitario: 12,
        unidad: 'hojas',
        proveedor: 'Dirección del Notariado Plurinacional',
        diasEntregaProveedor: 5
    },
    {
        id: 'inv-tokens-digitales',
        nombre: 'Tokens Criptográficos de Firma Digital',
        codigo: 'TOK-404',
        categoria: 'Tecnología Legal',
        stockActual: 7,
        stockMinimo: 10,
        stockOptimo: 25,
        consumoDiarioPromedio: 0.8, // ~9 días de cobertura
        costoUnitario: 280,
        unidad: 'dispositivos',
        proveedor: 'Agencia de Gobierno Electrónico',
        diasEntregaProveedor: 4
    },
    {
        id: 'inv-contratos-inmobiliarios',
        nombre: 'Kits de Contratos y Minutas Inmobiliarias',
        codigo: 'KIT-505',
        categoria: 'Formatos Contractuales',
        stockActual: 185,
        stockMinimo: 50,
        stockOptimo: 200,
        consumoDiarioPromedio: 3.1, // ~60 días de cobertura (Óptimo)
        costoUnitario: 35,
        unidad: 'kits',
        proveedor: 'Editorial Jurídica Lex',
        diasEntregaProveedor: 2
    },
    {
        id: 'inv-sellos-fechadores',
        nombre: 'Almohadillas de Tinta y Tinta Indeleble Forense',
        codigo: 'TIN-606',
        categoria: 'Material Notarial',
        stockActual: 24,
        stockMinimo: 10,
        stockOptimo: 30,
        consumoDiarioPromedio: 0.3, // Cobertura amplia
        costoUnitario: 45,
        unidad: 'frascos',
        proveedor: 'Suministros Corporativos',
        diasEntregaProveedor: 1
    }
];

/**
 * Suscribe al inventario en tiempo real. Si la colección está vacía, la inicializa automáticamente.
 */
export function subscribeToInventario(callback) {
    const colRef = getTenantCollection(INVENTARIO_COLLECTION);
    
    return onSnapshot(colRef, async (snapshot) => {
        if (snapshot.empty) {
            // Inicializar datos iniciales para este espacio
            try {
                for (const item of INVENTARIO_INICIAL) {
                    await setDoc(getTenantDoc(INVENTARIO_COLLECTION, item.id), {
                        ...item,
                        createdAt: serverTimestamp()
                    });
                }
            } catch (err) {
                console.warn("No se pudo sembrar inventario en Firestore, usando copia local:", err);
            }
            callback(calcularMetricasInventario(INVENTARIO_INICIAL));
            return;
        }

        const items = [];
        snapshot.forEach((d) => {
            items.push({ id: d.id, ...d.data() });
        });
        callback(calcularMetricasInventario(items));
    }, (err) => {
        console.warn("Error en suscripción de inventario, usando valores por defecto:", err);
        callback(calcularMetricasInventario(INVENTARIO_INICIAL));
    });
}

/**
 * Añade métricas calculadas a cada ítem: días de cobertura, cantidad sugerida a pedir y nivel de riesgo.
 */
export function calcularMetricasInventario(items) {
    return items.map(item => {
        const consumoDiario = item.consumoDiarioPromedio || 1;
        const diasCobertura = Math.max(0, Math.round(item.stockActual / consumoDiario));
        
        // Cantidad sugerida a pedir: llevar al stock óptimo considerando el tiempo de entrega del proveedor
        const bufferEntrega = Math.round(consumoDiario * (item.diasEntregaProveedor || 3));
        const deficit = (item.stockOptimo || (item.stockMinimo * 2)) - item.stockActual + bufferEntrega;
        const cantidadSugerida = Math.max(0, Math.ceil(deficit / 10) * 10); // Redondeado a decenas
        
        let nivelRiesgo = 'optimo'; // 'critico' (< 7 días), 'alerta' (< 15 días), 'optimo' (>= 15 días)
        if (diasCobertura <= 7 || item.stockActual <= item.stockMinimo) {
            nivelRiesgo = 'critico';
        } else if (diasCobertura <= 15) {
            nivelRiesgo = 'alerta';
        }

        return {
            ...item,
            diasCobertura,
            cantidadSugerida,
            nivelRiesgo,
            capitalInmovilizado: item.stockActual * (item.costoUnitario || 0)
        };
    });
}

export async function actualizarStockInventario(id, nuevoStock) {
    const docRef = getTenantDoc(INVENTARIO_COLLECTION, id);
    return await updateDoc(docRef, {
        stockActual: parseFloat(nuevoStock),
        updatedAt: serverTimestamp()
    });
}
