import { db } from '$lib/firebase/client.js';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    doc, 
    query, 
    where, 
    onSnapshot, 
    serverTimestamp 
} from 'firebase/firestore';

const NOTIFICACIONES_COLLECTION = 'notificaciones_sistema';

/**
 * Genera una URL para abrir directamente el redactor de Gmail en una nueva pestaña
 */
export function generarUrlGmailDirecto({ to = '', subject = '', body = '' }) {
    const baseUrl = 'https://mail.google.com/mail/?view=cm&fs=1';
    const params = new URLSearchParams();
    if (to) params.set('to', to);
    if (subject) params.set('su', subject);
    if (body) params.set('body', body);
    return `${baseUrl}&${params.toString()}`;
}

/**
 * Abre Gmail en una nueva pestaña con los datos precargados. Si el navegador bloquea la ventana emergente, recurre al enlace mailto:.
 */
export function abrirEnGmail({ to = '', subject = '', body = '' }) {
    if (typeof window === 'undefined') return;
    const url = generarUrlGmailDirecto({ to, subject, body });
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win || win.closed || typeof win.closed === 'undefined') {
        const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailto;
    }
}

/**
 * Guarda la notificación en Firestore para el Centro de Notificaciones en la app
 */
export async function registrarNotificacionEnSistema({
    tipo = 'general', // 'chat' | 'calendario' | 'ingreso' | 'secreto'
    destinatarioEmail = '',
    destinatarioNombre = '',
    destinatarioUid = '',
    asunto = '',
    mensaje = '',
    linkAccion = '',
    datosExtra = {}
}) {
    try {
        const notifData = {
            tipo,
            destinatarioEmail: destinatarioEmail || null,
            destinatarioNombre: destinatarioNombre || 'Usuario',
            destinatarioUid: destinatarioUid || 'todos',
            asunto,
            mensaje,
            linkAccion: linkAccion || null,
            datosExtra: datosExtra || {},
            leido: false,
            fecha: serverTimestamp(),
            _localTime: Date.now()
        };

        const docRef = await addDoc(collection(db, NOTIFICACIONES_COLLECTION), notifData);

        // Si el navegador tiene permiso de notificaciones push, disparar de inmediato
        if (typeof window !== 'undefined' && "Notification" in window && Notification.permission === "granted") {
            try {
                new Notification(asunto, {
                    body: mensaje,
                    icon: '/legal.png'
                });
            } catch (e) {}
        }

        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Error registrando notificación en sistema:", error);
        return { success: false, error };
    }
}

/**
 * Envía notificación automática al correo electrónico a través del endpoint backend
 */
export async function enviarNotificacionPorEmail({
    to,
    destinatarioNombre = '',
    subject,
    html,
    text,
    tipo = 'general'
}) {
    if (!to || !to.includes('@')) {
        console.warn("Email de destinatario no válido:", to);
        return { success: false, reason: 'email_invalido' };
    }

    try {
        const response = await fetch('/api/notificar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to,
                destinatarioNombre,
                subject,
                html: html || text,
                text: text || html,
                tipo
            })
        });

        if (response.ok) {
            return await response.json();
        } else {
            console.warn("Respuesta no OK de /api/notificar:", response.status);
            return { success: false, status: response.status };
        }
    } catch (e) {
        console.warn("Fallo despacho a /api/notificar (se mantendrá en bandeja de sistema):", e);
        return { success: false, error: e.message };
    }
}

// ====================================================================
// DISPARADORES ESPECÍFICOS PARA LOS EVENTOS CLAVE DE LA FIRMA
// ====================================================================

/**
 * 1. NOTIFICACIÓN POR NUEVO MENSAJE EN CHAT LEGAL
 */
export async function notificarNuevoMensajeChat({
    emisorNombre,
    receptorEmail,
    receptorNombre,
    receptorUid,
    textoMensaje,
    isPVD = false
}) {
    const asunto = `💬 [Chat Legal] ${emisorNombre} te ha enviado un mensaje ${isPVD ? 'efímero' : 'confidencial'}`;
    const previewTexto = isPVD ? 'Contenido protegido con autodestrucción (2 segundos tras lectura).' : (textoMensaje.length > 80 ? textoMensaje.slice(0, 80) + '...' : textoMensaje);
    const mensaje = `${emisorNombre} te ha enviado una comunicación en Chat Legal: "${previewTexto}". Ingresa al portal para responder.`;
    const linkAccion = '/dashboard/chatlegal';

    // 1. Guardar en Firestore para ver en la app
    await registrarNotificacionEnSistema({
        tipo: 'chat',
        destinatarioEmail: receptorEmail,
        destinatarioNombre: receptorNombre,
        destinatarioUid: receptorUid,
        asunto,
        mensaje,
        linkAccion,
        datosExtra: { emisorNombre, isPVD }
    });

    // 2. Enviar por email si el destinatario tiene correo
    if (receptorEmail && receptorEmail.includes('@')) {
        const cuerpoHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                <div style="background-color: #006a39; color: #ffffff; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h2 style="margin: 0; font-size: 18px; color: #ffe08e;">Casa Legal — Comunicación Privada</h2>
                </div>
                <p>Estimado/a <strong>${receptorNombre || 'Colega'}</strong>,</p>
                <p>Has recibido un nuevo mensaje confidencial de <strong>${emisorNombre}</strong> en el portal de la firma:</p>
                <blockquote style="background-color: #f8fafc; border-left: 4px solid #c5a059; padding: 12px 16px; margin: 15px 0; font-style: italic; color: #1e293b;">
                    "${previewTexto}"
                </blockquote>
                <p style="margin-top: 25px;">
                    <a href="${typeof window !== 'undefined' ? window.location.origin : 'https://casalegal.bo'}/dashboard/chatlegal" style="background-color: #006a39; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">
                        Abrir Chat Legal
                    </a>
                </p>
                <hr style="margin-top: 30px; border: 0; border-top: 1px solid #e2e8f0;">
                <p style="font-size: 11px; color: #64748b;">Aviso confidencial generado por el sistema de comunicaciones de Casa Legal.</p>
            </div>
        `;
        await enviarNotificacionPorEmail({
            to: receptorEmail,
            destinatarioNombre: receptorNombre,
            subject: asunto,
            html: cuerpoHtml,
            text: mensaje,
            tipo: 'chat'
        });
    }
}

/**
 * 2. NOTIFICACIÓN POR NUEVA REUNIÓN O AUDIENCIA EN CALENDARIO
 */
export async function notificarEventoCalendario({
    titulo,
    tipoEvento = 'Audiencia',
    fechaHora,
    asignadoAEmail,
    asignadoANombre,
    asignadoAUid,
    creadoPorNombre = 'Administrador',
    notas = ''
}) {
    const fechaHoraStr = fechaHora instanceof Date ? fechaHora.toLocaleString('es-BO') : String(fechaHora);
    const asunto = `📅 [Calendario] Nueva Actividad Asignada: ${titulo} (${tipoEvento})`;
    const mensaje = `Se ha programado una actividad para ti: "${titulo}" (${tipoEvento}) para el ${fechaHoraStr}. Creada por ${creadoPorNombre}.`;
    const linkAccion = '/dashboard/calendario';

    await registrarNotificacionEnSistema({
        tipo: 'calendario',
        destinatarioEmail: asignadoAEmail,
        destinatarioNombre: asignadoANombre,
        destinatarioUid: asignadoAUid,
        asunto,
        mensaje,
        linkAccion,
        datosExtra: { titulo, tipoEvento, fechaHoraStr, notas }
    });

    if (asignadoAEmail && asignadoAEmail.includes('@')) {
        const cuerpoHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                <div style="background-color: #006a39; color: #ffffff; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h2 style="margin: 0; font-size: 18px; color: #ffe08e;">Casa Legal — Agenda de Actividades</h2>
                </div>
                <p>Estimado/a <strong>${asignadoANombre || 'Colega'}</strong>,</p>
                <p>Se te ha asignado una nueva actividad en el calendario de la firma:</p>
                <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin: 15px 0;">
                    <p style="margin: 5px 0;"><strong>Asunto:</strong> ${titulo}</p>
                    <p style="margin: 5px 0;"><strong>Tipo:</strong> ${tipoEvento}</p>
                    <p style="margin: 5px 0;"><strong>Fecha y Hora:</strong> ${fechaHoraStr}</p>
                    ${notas ? `<p style="margin: 5px 0;"><strong>Detalles:</strong> ${notas}</p>` : ''}
                </div>
                <p style="margin-top: 25px;">
                    <a href="${typeof window !== 'undefined' ? window.location.origin : 'https://casalegal.bo'}/dashboard/calendario" style="background-color: #006a39; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">
                        Ver en Calendario
                    </a>
                </p>
            </div>
        `;
        await enviarNotificacionPorEmail({
            to: asignadoAEmail,
            destinatarioNombre: asignadoANombre,
            subject: asunto,
            html: cuerpoHtml,
            text: mensaje,
            tipo: 'calendario'
        });
    }
}

/**
 * 3. NOTIFICACIÓN POR NUEVO INGRESO FINANCIERO / HONORARIOS
 */
export async function notificarNuevoIngresoFinanciero({
    monto,
    concepto,
    categoria,
    registradoPorNombre = 'Personal Legal',
    adminEmail,
    empleadoRelacionadoEmail = null,
    empleadoRelacionadoNombre = null
}) {
    const asunto = `💰 [Cuentas] Nuevo Ingreso Registrado: Bs. ${Number(monto).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`;
    const mensaje = `${registradoPorNombre} ha registrado un ingreso de Bs. ${Number(monto).toLocaleString('es-BO', { minimumFractionDigits: 2 })} por concepto de "${concepto}" (${categoria}).`;
    const linkAccion = '/dashboard/cuentas';

    // 1. Guardar para el administrador general
    await registrarNotificacionEnSistema({
        tipo: 'ingreso',
        destinatarioEmail: adminEmail,
        destinatarioNombre: 'Administrador General',
        destinatarioUid: 'admin',
        asunto,
        mensaje,
        linkAccion,
        datosExtra: { monto, concepto, categoria, registradoPorNombre }
    });

    const cuerpoHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="background-color: #006a39; color: #ffffff; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="margin: 0; font-size: 18px; color: #ffe08e;">Casa Legal — Control Financiero</h2>
            </div>
            <p>Se ha registrado un nuevo ingreso económico en la bóveda de la firma:</p>
            <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 15px; margin: 15px 0;">
                <p style="margin: 5px 0; font-size: 22px; font-weight: bold; color: #166534;">Bs. ${Number(monto).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</p>
                <p style="margin: 5px 0;"><strong>Concepto:</strong> ${concepto}</p>
                <p style="margin: 5px 0;"><strong>Categoría:</strong> ${categoria}</p>
                <p style="margin: 5px 0;"><strong>Registrado por:</strong> ${registradoPorNombre}</p>
                <p style="margin: 5px 0; font-size: 12px; color: #64748b;">Fecha: ${new Date().toLocaleString('es-BO')}</p>
            </div>
            <p style="margin-top: 25px;">
                <a href="${typeof window !== 'undefined' ? window.location.origin : 'https://casalegal.bo'}/dashboard/cuentas" style="background-color: #006a39; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Ver Bóveda Financiera
                </a>
            </p>
        </div>
    `;

    // Enviar al Administrador
    if (adminEmail && adminEmail.includes('@')) {
        await enviarNotificacionPorEmail({
            to: adminEmail,
            destinatarioNombre: 'Administrador General',
            subject: asunto,
            html: cuerpoHtml,
            text: mensaje,
            tipo: 'ingreso'
        });
    }

    // Si hay un empleado responsable o asignado al caso, también notificarlo
    if (empleadoRelacionadoEmail && empleadoRelacionadoEmail !== adminEmail && empleadoRelacionadoEmail.includes('@')) {
        await enviarNotificacionPorEmail({
            to: empleadoRelacionadoEmail,
            destinatarioNombre: empleadoRelacionadoNombre || 'Abogado',
            subject: asunto,
            html: cuerpoHtml,
            text: mensaje,
            tipo: 'ingreso'
        });
    }
}

/**
 * 4. NOTIFICACIÓN CUANDO UN ENLACE SEGURO ES ABIERTO (TELEMETRÍA FORENSE)
 */
export async function notificarEnlaceSeguroAbierto({
    emisorEmail,
    emisorNombre = 'Abogado',
    enlaceId,
    telemetria
}) {
    if (!emisorEmail || !emisorEmail.includes('@')) return;

    const asunto = `👁️ [Chat Legal] Enlace Seguro Abierto: Telemetría Detectada`;
    const dispositivo = telemetria?.dispositivoEstimado || 'Dispositivo';
    const ip = telemetria?.ipPublica || 'IP Detectada';
    const bateria = telemetria?.nivelBateria || 'Batería';
    const mensaje = `El enlace confidencial (ID: ${enlaceId.slice(0, 8)}) fue abierto desde un ${dispositivo} (IP: ${ip}, Batería: ${bateria}). El mensaje ha comenzado su autodestrucción.`;

    await registrarNotificacionEnSistema({
        tipo: 'secreto',
        destinatarioEmail: emisorEmail,
        destinatarioNombre: emisorNombre,
        destinatarioUid: 'emisor',
        asunto,
        mensaje,
        linkAccion: '/dashboard/chatlegal?tab=radar',
        datosExtra: { enlaceId, telemetria }
    });

    const cuerpoHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="background-color: #006a39; color: #ffffff; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="margin: 0; font-size: 18px; color: #ffe08e;">Chat Legal — Auditoría de Enlace</h2>
            </div>
            <p>Estimado/a <strong>${emisorNombre}</strong>,</p>
            <p>Te informamos que tu enlace confidencial ha sido <strong>abierto por el destinatario</strong>. Los datos forenses han sido rescatados con éxito:</p>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Dispositivo:</strong> ${dispositivo}</p>
                <p style="margin: 5px 0;"><strong>Dirección IP:</strong> ${ip}</p>
                <p style="margin: 5px 0;"><strong>Batería:</strong> ${bateria}</p>
                <p style="margin: 5px 0;"><strong>Hora de Apertura:</strong> ${new Date().toLocaleTimeString('es-BO')}</p>
            </div>
            <p style="font-size: 13px; color: #b45309; font-weight: bold;">
                ⚠️ El mensaje confidencial ha comenzado su proceso de autodestrucción definitiva.
            </p>
        </div>
    `;

    await enviarNotificacionPorEmail({
        to: emisorEmail,
        destinatarioNombre: emisorNombre,
        subject: asunto,
        html: cuerpoHtml,
        text: mensaje,
        tipo: 'secreto'
    });
}

/**
 * 5. NOTIFICACIÓN AL ENVIAR UN ENLACE SEGURO A UN CLIENTE
 */
export async function notificarEnlaceSeguroCreado({
    destinatarioEmail,
    destinatarioNombre = 'Cliente',
    enlaceUrl,
    tiempoSegundos = 10,
    tienePin = false,
    remitenteNombre = 'Casa Legal'
}) {
    if (!destinatarioEmail || !destinatarioEmail.includes('@')) return;

    const asunto = `🔒 [Confidencial] Comunicación Jurídica Reservada de ${remitenteNombre}`;
    const mensaje = `Has recibido un documento o mensaje confidencial protegido por secreto profesional. El enlace cuenta con autodestrucción en ${tiempoSegundos} segundos.`;

    const cuerpoHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="background-color: #006a39; color: #ffffff; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="margin: 0; font-size: 18px; color: #ffe08e;">Casa Legal — Mensajería Segura</h2>
            </div>
            <p>Estimado/a <strong>${destinatarioNombre}</strong>,</p>
            <p><strong>${remitenteNombre}</strong> le ha transmitido una comunicación judicial confidencial protegida por secreto profesional.</p>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Condición de Seguridad:</strong> Lectura Efímera</p>
                <p style="margin: 5px 0;"><strong>Tiempo de Autodestrucción:</strong> ${tiempoSegundos} segundos tras apertura</p>
                ${tienePin ? '<p style="margin: 5px 0; color: #b45309;"><strong>Protección con PIN:</strong> Solicite la clave de acceso al remitente.</p>' : ''}
            </div>
            <p style="margin-top: 25px;">
                <a href="${enlaceUrl}" style="background-color: #006a39; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Abrir Comunicación Segura
                </a>
            </p>
            <p style="font-size: 11px; color: #64748b; margin-top: 20px;">
                Si el botón no funciona, copie y pegue el siguiente enlace en su navegador:<br/>
                <code>${enlaceUrl}</code>
            </p>
        </div>
    `;

    return await enviarNotificacionPorEmail({
        to: destinatarioEmail,
        destinatarioNombre,
        subject: asunto,
        html: cuerpoHtml,
        text: `${mensaje}\n\nEnlace: ${enlaceUrl}`,
        tipo: 'secreto'
    });
}

/**
 * Solicita permisos para Notificaciones Push en el navegador
 */
export async function solicitarPermisoPush() {
    if (typeof window === 'undefined' || !("Notification" in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    try {
        return await Notification.requestPermission();
    } catch (e) {
        return 'denied';
    }
}

/**
 * Escucha las notificaciones del usuario en tiempo real
 */
export function subscribeToNotificaciones(userId, userEmail, callback) {
    if (!userId && !userEmail) return () => {};

    const q = query(
        collection(db, NOTIFICACIONES_COLLECTION)
    );

    return onSnapshot(q, (snapshot) => {
        const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const mias = notifs.filter(n => 
            n.destinatarioUid === userId || 
            n.destinatarioUid === 'todos' || 
            (userEmail && n.destinatarioEmail === userEmail) ||
            (n.destinatarioUid === 'admin' && userId === 'admin')
        ).sort((a, b) => {
            const timeA = a.fecha?.toMillis ? a.fecha.toMillis() : (a._localTime || 0);
            const timeB = b.fecha?.toMillis ? b.fecha.toMillis() : (b._localTime || 0);
            return timeB - timeA;
        });
        callback(mias);
    }, (err) => console.warn("Error snapshot notificaciones:", err));
}

/**
 * Marca una notificación como leída
 */
export async function marcarNotificacionLeida(notifId) {
    try {
        const docRef = doc(db, NOTIFICACIONES_COLLECTION, notifId);
        await updateDoc(docRef, { leido: true });
    } catch (e) {
        console.error("Error al marcar notificación leída:", e);
    }
}
