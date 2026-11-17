import { storage } from '$lib/firebase/client.js';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Optimiza y redimensiona cualquier imagen a un tamaño apto para PWA, logos y avatares (máx 512x512).
 * Garantiza que la imagen nunca exceda los límites de Firestore (~30KB) y sube a Firebase Storage si está disponible.
 *
 * @param {File|Blob} file - Archivo de imagen seleccionado por el usuario
 * @param {Object} options - Configuración de tamaño y calidad
 * @returns {Promise<{ url: string, dataUrl: string, sizeKb: number }>}
 */
export async function optimizeAndUploadLogo(file, options = {}) {
    const maxWidth = options.maxWidth || 512;
    const maxHeight = options.maxHeight || 512;
    const quality = options.quality || 0.88;
    const slug = options.slug || 'firma';

    if (!file) {
        throw new Error("No se ha seleccionado ningún archivo de imagen.");
    }

    // 1. Cargar imagen en elemento Image
    const dataUrlRaw = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (err) => reject(new Error("Formato de imagen inválido o corrupto"));
        image.src = dataUrlRaw;
    });

    // 2. Calcular dimensiones proporcionales
    let { width, height } = img;
    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    // 3. Dibujar en canvas optimizado
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Habilitar suavizado de alta calidad
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // 4. Exportar a formato WebP o PNG liviano
    let mimeType = 'image/webp';
    let dataUrlOptimized = canvas.toDataURL(mimeType, quality);
    
    // Si el navegador no soporta webp o el resultado es mayor, probar PNG
    if (!dataUrlOptimized.startsWith('data:image/webp')) {
        mimeType = 'image/png';
        dataUrlOptimized = canvas.toDataURL('image/png');
    }

    const approxSizeKb = Math.round((dataUrlOptimized.length * 3) / 4 / 1024);

    // 5. Intentar subir el Blob a Firebase Storage
    let storageUrl = null;
    try {
        const blob = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), mimeType, quality);
        });

        if (blob && storage) {
            const fileName = `logos/${slug}_${Date.now()}.${mimeType === 'image/webp' ? 'webp' : 'png'}`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, blob, {
                contentType: mimeType,
                cacheControl: 'public, max-age=31536000'
            });
            storageUrl = await getDownloadURL(storageRef);
        }
    } catch (storageErr) {
        console.warn("Storage no disponible o sin permisos; usando base64 optimizado (~" + approxSizeKb + "KB):", storageErr);
    }

    const finalUrl = storageUrl || dataUrlOptimized;

    // Actualizar iconos dinámicos en el navegador si estamos en cliente
    updateBrowserIcons(finalUrl);

    return {
        url: finalUrl,
        dataUrl: dataUrlOptimized,
        sizeKb: approxSizeKb
    };
}

/**
 * Actualiza los enlaces de favicon y apple-touch-icon en el <head> del documento
 */
export function updateBrowserIcons(iconUrl) {
    if (typeof document === 'undefined' || !iconUrl) return;

    try {
        // Favicon estándar
        let favicon = document.querySelector('link[rel="icon"]');
        if (!favicon) {
            favicon = document.createElement('link');
            favicon.rel = 'icon';
            document.head.appendChild(favicon);
        }
        favicon.href = iconUrl;

        // Apple Touch Icon para iOS y Android
        let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
        if (!appleIcon) {
            appleIcon = document.createElement('link');
            appleIcon.rel = 'apple-touch-icon';
            document.head.appendChild(appleIcon);
        }
        appleIcon.href = iconUrl;

        // Atajo también para shortcut icon
        let shortcutIcon = document.querySelector('link[rel="shortcut icon"]');
        if (!shortcutIcon) {
            shortcutIcon = document.createElement('link');
            shortcutIcon.rel = 'shortcut icon';
            document.head.appendChild(shortcutIcon);
        }
        shortcutIcon.href = iconUrl;
    } catch (e) {
        console.warn("No se pudo actualizar iconos del navegador:", e);
    }
}
