import { json } from '@sveltejs/kit';
import { db } from '$lib/firebase/client.js';
import { doc, getDoc } from 'firebase/firestore';

export async function GET({ url }) {
    const slug = url.searchParams.get('slug');
    let firma = {
        nombre: 'Casa Legal',
        subtitulo: 'Sistema Jurídico e Inmobiliario',
        colorPrimario: '#006a39',
        colorFondo: '#f8f9ff',
        logoUrl: '/legal.png'
    };

    if (slug && slug !== 'casa-legal') {
        try {
            const snap = await getDoc(doc(db, 'firmas_duplicadas', slug));
            if (snap.exists()) {
                const data = snap.data();
                firma.nombre = data.nombre || firma.nombre;
                firma.subtitulo = data.subtitulo || firma.subtitulo;
                firma.colorPrimario = data.colorPrimario || firma.colorPrimario;
                firma.colorFondo = data.colorFondo || firma.colorFondo;
                firma.logoUrl = data.logoUrl || firma.logoUrl;
            }
        } catch (e) {
            console.warn("Error cargando manifest para slug:", slug, e);
        }
    }

    const manifestData = {
        name: `${firma.nombre} - Sistema Jurídico`,
        short_name: firma.nombre,
        description: firma.subtitulo,
        start_url: slug ? `/${slug}` : '/',
        display: 'standalone',
        background_color: firma.colorFondo || '#f8f9ff',
        theme_color: firma.colorPrimario || '#006a39',
        icons: [
            {
                src: firma.logoUrl || '/legal.png',
                sizes: '192x192 512x512',
                type: 'image/png',
                purpose: 'any maskable'
            }
        ]
    };

    return json(manifestData, {
        headers: {
            'Content-Type': 'application/manifest+json',
            'Cache-Control': 'public, max-age=600'
        }
    });
}
