<script>
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import { authStore } from '$lib/stores/auth.js';
    import { empresaStore } from '$lib/stores/empresa.js';
    import { subscribeToEmpleados } from '$lib/firebase/empleados.js';
    import { 
        subscribeToMessages, 
        sendMessage, 
        markAsRead, 
        uploadChatImage,
        uploadDeadDropFile,
        crearSecretoAntiEspia,
        subscribeToSecretosGenerados,
        purgarSecretoDefinitivo
    } from '$lib/firebase/chatlegal.js';
    import { 
        notificarNuevoMensajeChat, 
        notificarEnlaceSeguroCreado, 
        abrirEnGmail 
    } from '$lib/services/notificaciones.js';

    // State General
    let empleados = $state([]);
    let currentUser = $derived($authStore.user);
    let searchUserQuery = $state('');
    let selectedUser = $state(null);
    let mobileChatView = $state('list'); // 'list' | 'chat'
    let unsubscribeEmpleados = null;
    let unsubscribeMessages = null;
    let unsubscribeSecretos = null;

    // Vista Activa
    let vistaActiva = $state('chat'); // 'chat' | 'deaddrop' | 'radar'

    // Escuchar parámetros de URL para abrir pestaña automáticamente (?tab=deaddrop o ?tab=seguro)
    $effect(() => {
        const tabParam = $page.url.searchParams.get('tab');
        if (tabParam === 'deaddrop' || tabParam === 'seguro' || tabParam === 'enlace') {
            vistaActiva = 'deaddrop';
        } else if (tabParam === 'radar' || tabParam === 'dispositivos') {
            vistaActiva = 'radar';
        }
    });

    // Chat State
    let messages = $state([]);
    let currentMessage = $state('');
    let isPVDMode = $state(false);
    let imageFile = $state(null);
    let fileInputRef = $state(null);
    let isSending = $state(false);
    let chatContainer = $state(null);

    // Enlace Seguro / Dead Drop State
    let dropTexto = $state('');
    let dropTiempo = $state(10); // segundos
    let dropPin = $state('');
    let dropDestinatarioEmail = $state('');
    let dropDestinatarioNombre = $state('');
    let autoAbrirGmail = $state(true);
    let isCreandoDrop = $state(false);
    let dropGenerado = $state(null);
    let linkCopiado = $state(false);

    // Archivos Adjuntos (Imágenes, Documentos, PDF, etc.)
    let dropFile = $state(null);
    let dropFilePreview = $state(null);
    let dropFileInputRef = $state(null);

    // Grabación de Nota de Voz Confidencial
    let isRecordingVoice = $state(false);
    let recordingDuration = $state(0);
    let mediaRecorder = null;
    let audioChunks = [];
    let recordedAudioBlob = $state(null);
    let recordedAudioUrl = $state(null);
    let recordingInterval = null;

    // Telemetría & Secretos Generados
    let listaSecretos = $state([]);
    let secretoModal = $state(null);

    // Modo Discreto / Camuflaje
    let modoPanico = $state(false);

    // Derived
    let myId = $derived(currentUser?.uid || $authStore.profile?.authUid || 'admin');

    let filteredEmpleados = $derived(empleados.filter(e => {
        const empId = e.authUid || e.id;
        const matchesQuery = (e.nombre || '').toLowerCase().includes(searchUserQuery.toLowerCase()) || 
                             (e.apellidos || '').toLowerCase().includes(searchUserQuery.toLowerCase()) ||
                             (e.rol || '').toLowerCase().includes(searchUserQuery.toLowerCase());
        return empId !== myId && matchesQuery;
    }));

    onMount(() => {
        unsubscribeEmpleados = subscribeToEmpleados(data => {
            empleados = data;
            // Si hay empleados y no hay ninguno seleccionado en desktop, seleccionar el primero
            if (!selectedUser && data.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 768) {
                const primerColega = data.find(e => (e.authUid || e.id) !== myId);
                if (primerColega) {
                    selectUser(primerColega);
                }
            }
        });

        if (myId) {
            unsubscribeSecretos = subscribeToSecretosGenerados(myId, (data) => {
                listaSecretos = data;
            });
        }

        // Atajo para Modo Discreto: Ctrl + Shift + X o Triple Escape
        let escCount = 0;
        let lastEscTime = 0;

        function handleGlobalKeys(e) {
            if (e.ctrlKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
                e.preventDefault();
                modoPanico = !modoPanico;
            }
            if (e.key === 'Escape') {
                const now = Date.now();
                if (now - lastEscTime < 500) {
                    escCount++;
                    if (escCount >= 2) {
                        modoPanico = true;
                        escCount = 0;
                    }
                } else {
                    escCount = 1;
                }
                lastEscTime = now;
            }
        }

        window.addEventListener('keydown', handleGlobalKeys);

        return () => {
            window.removeEventListener('keydown', handleGlobalKeys);
        };
    });

    onDestroy(() => {
        if (unsubscribeEmpleados) unsubscribeEmpleados();
        if (unsubscribeMessages) unsubscribeMessages();
        if (unsubscribeSecretos) unsubscribeSecretos();
    });

    function selectUser(user) {
        selectedUser = user;
        mobileChatView = 'chat';
        if (unsubscribeMessages) unsubscribeMessages();
        
        const targetId = user.authUid || user.id;
        
        unsubscribeMessages = subscribeToMessages(myId, targetId, (msgs) => {
            messages = msgs;
            processUnreadPVD(msgs);
            scrollToBottom();
        });
    }

    function processUnreadPVD(msgs) {
        msgs.forEach(msg => {
            if (msg.receptorId === myId && !msg.leido && msg.isPVD) {
                markAsRead(msg.id, true, msg.imageUrl);
            }
            if (msg.receptorId === myId && !msg.leido && !msg.isPVD) {
                markAsRead(msg.id, false);
            }
        });
    }

    function scrollToBottom() {
        setTimeout(() => {
            if (chatContainer) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }, 100);
    }

    async function handleSendMessage(e) {
        if (e) e.preventDefault();
        const textoAEnviar = currentMessage.trim();
        if ((!textoAEnviar && !imageFile) || !selectedUser || isSending) return;

        const targetId = selectedUser.authUid || selectedUser.id;

        // Inserción optimista para visualización inmediata en tiempo real
        const optimisticMsg = {
            id: 'opt_' + Date.now(),
            texto: textoAEnviar,
            imageUrl: null,
            emisorId: myId,
            receptorId: targetId,
            isPVD: isPVDMode,
            leido: false,
            fechaEnvio: new Date(),
            _localTimestamp: Date.now()
        };
        messages = [...messages, optimisticMsg];
        currentMessage = '';
        scrollToBottom();

        isSending = true;
        try {
            let imageUrl = null;
            if (imageFile) {
                imageUrl = await uploadChatImage(imageFile);
                optimisticMsg.imageUrl = imageUrl;
            }
            
            await sendMessage(
                textoAEnviar, 
                imageUrl, 
                myId, 
                targetId, 
                isPVDMode
            );
            
            // Disparar Notificación Push y Gmail al destinatario
            const myNombre = $authStore.profile?.name || $authStore.profile?.nombre || 'Colega Legal';
            const receptorNombre = `${selectedUser.nombre || ''} ${selectedUser.apellidos || ''}`.trim() || 'Colega';
            const receptorEmail = selectedUser.email || null;

            notificarNuevoMensajeChat({
                emisorNombre: myNombre,
                receptorEmail: receptorEmail,
                receptorNombre: receptorNombre,
                receptorUid: targetId,
                textoMensaje: textoAEnviar,
                isPVD: isPVDMode
            }).catch(e => console.warn("Aviso chat:", e));

            imageFile = null;
            if (fileInputRef) fileInputRef.value = '';
            scrollToBottom();
        } catch (error) {
            console.error(error);
            alert("No se pudo enviar el mensaje.");
        } finally {
            isSending = false;
        }
    }

    async function startVoiceRecording() {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            alert("Tu navegador no soporta grabación de voz o requiere permisos de micrófono.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                recordedAudioUrl = URL.createObjectURL(recordedAudioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecordingVoice = true;
            recordingDuration = 0;
            recordingInterval = setInterval(() => {
                recordingDuration++;
            }, 1000);
        } catch (err) {
            console.error("Error acceso micrófono:", err);
            alert("No se pudo acceder al micrófono. Por favor permite el acceso en el navegador.");
        }
    }

    function stopVoiceRecording() {
        if (mediaRecorder && isRecordingVoice) {
            mediaRecorder.stop();
            isRecordingVoice = false;
            clearInterval(recordingInterval);
        }
    }

    function cancelVoiceRecording() {
        if (mediaRecorder && isRecordingVoice) {
            mediaRecorder.stop();
        }
        isRecordingVoice = false;
        clearInterval(recordingInterval);
        recordedAudioBlob = null;
        recordedAudioUrl = null;
        recordingDuration = 0;
    }

    function handleDropFileChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 30 * 1024 * 1024) {
            alert("El archivo no debe superar los 30 MB.");
            return;
        }
        dropFile = file;
        if (file.type.startsWith('image/')) {
            dropFilePreview = URL.createObjectURL(file);
        } else {
            dropFilePreview = null;
        }
    }

    function removeDropFile() {
        dropFile = null;
        dropFilePreview = null;
        if (dropFileInputRef) dropFileInputRef.value = '';
    }

    function avisarColegaPorGmail(colega) {
        if (!colega) return;
        const nombreFirma = $empresaStore?.nombre || 'Casa Legal';
        const remitente = $authStore.profile?.name || $authStore.profile?.nombre || 'Abogado de la Firma';
        const asunto = `💬 [Chat Legal] Mensaje de ${remitente} - ${nombreFirma}`;
        const cuerpo = `Estimado/a ${colega.nombre || 'Colega'}:\n\nTe he enviado una comunicación confidencial en el módulo de Chat Legal del sistema ${nombreFirma}.\n\nPor favor ingresa al portal oficial para responder:\n${typeof window !== 'undefined' ? window.location.origin : 'https://casalegal.bo'}/dashboard/chatlegal\n\nSaludos cordiales,\n${remitente}`;
        abrirEnGmail({
            to: colega.email || '',
            subject: asunto,
            body: cuerpo
        });
    }

    async function handleCrearDeadDrop(e) {
        if (e) e.preventDefault();
        if (!dropTexto.trim() && !dropFile && !recordedAudioBlob) {
            return alert("Por favor escribe un mensaje o adjunta un archivo, audio o imagen confidencial.");
        }

        const textoGuardado = dropTexto.trim();
        isCreandoDrop = true;
        try {
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            const myNombre = $authStore.profile?.name || $authStore.profile?.nombre || 'Abogado de la Firma';
            const myEmail = $authStore.user?.email || $empresaStore?.email || '';

            let archivoMetadata = null;

            // 1. Si grabó audio desde el micrófono
            if (recordedAudioBlob) {
                const audioFile = new File([recordedAudioBlob], `audio_confidencial_${Date.now()}.webm`, { type: 'audio/webm' });
                archivoMetadata = await uploadDeadDropFile(audioFile);
            } else if (dropFile) {
                archivoMetadata = await uploadDeadDropFile(dropFile);
            }

            const pinLimpio = (dropPin && typeof dropPin === 'string') ? dropPin.trim() : '';
            const tienePinReal = pinLimpio.length > 0;

            const res = await crearSecretoAntiEspia({
                texto: textoGuardado || (archivoMetadata ? `[Archivo Confidencial: ${archivoMetadata.nombre}]` : ''),
                archivo: archivoMetadata,
                tiempoSegundos: dropTiempo,
                clavePin: pinLimpio,
                emisorUid: myId,
                emisorNombre: myNombre,
                emisorEmail: myEmail,
                destinatarioEmail: dropDestinatarioEmail.trim(),
                destinatarioNombre: dropDestinatarioNombre.trim()
            });

            const enlaceUrl = `${origin}/chatlegal/${res.id}`;

            dropGenerado = {
                id: res.id,
                url: enlaceUrl,
                tiempoSegundos: dropTiempo,
                tienePin: tienePinReal,
                pin: pinLimpio,
                texto: textoGuardado || (archivoMetadata ? `[Adjunto: ${archivoMetadata.nombre}]` : ''),
                archivo: archivoMetadata,
                destinatarioEmail: dropDestinatarioEmail.trim(),
                destinatarioNombre: dropDestinatarioNombre.trim()
            };

            // Notificar por email automáticamente si se especificó el correo
            if (dropDestinatarioEmail.trim()) {
                notificarEnlaceSeguroCreado({
                    destinatarioEmail: dropDestinatarioEmail.trim(),
                    destinatarioNombre: dropDestinatarioNombre.trim() || 'Cliente',
                    enlaceUrl,
                    tiempoSegundos: dropTiempo,
                    tienePin: tienePinReal,
                    remitenteNombre: myNombre
                }).catch(e => console.warn("Aviso email enlace:", e));

                // Si autoAbrirGmail está activo, abrir directamente el redactor de Gmail en nueva pestaña
                if (autoAbrirGmail) {
                    compartirPorGmail(dropGenerado);
                }
            }

            // Limpiar formulario
            dropTexto = '';
            dropPin = '';
            dropFile = null;
            dropFilePreview = null;
            if (dropFileInputRef) dropFileInputRef.value = '';
            cancelVoiceRecording();
        } catch (e) {
            console.error(e);
            alert("Error al generar enlace seguro: " + (e.message || 'Intente nuevamente'));
        } finally {
            isCreandoDrop = false;
        }
    }

    function copiarLinkDrop(url) {
        if (!url) return;
        navigator.clipboard.writeText(url);
        linkCopiado = true;
        setTimeout(() => linkCopiado = false, 2000);
    }

    function compartirPorGmail(drop) {
        if (!drop) return;
        const nombreFirma = $empresaStore?.nombre || 'Casa Legal';
        const remitente = $authStore.profile?.name || $authStore.profile?.nombre || 'Abogado de la Firma';
        const asunto = `🔒 [Confidencial] Comunicación Segura - ${nombreFirma}`;
        const pinAviso = (drop.tienePin && drop.pin) ? `\n\nClave PIN de Acceso: ${drop.pin}` : '';
        const cuerpo = `Estimado/a ${drop.destinatarioNombre || 'Cliente'}:\n\nLe transmitimos una comunicación confidencial protegida por secreto profesional.\n\nPara acceder al contenido seguro (el cual se autodestruirá automáticamente a los ${drop.tiempoSegundos} segundos de su apertura), por favor ingrese al siguiente enlace oficial:\n\n${drop.url}${pinAviso}\n\nPor favor ábralo desde su dispositivo seguro.\n\nAtentamente,\n${remitente}\n${nombreFirma}`;
        
        abrirEnGmail({
            to: drop.destinatarioEmail || '',
            subject: asunto,
            body: cuerpo
        });
    }

    function compartirPorWhatsApp(drop) {
        if (!drop) return;
        const pinAviso = (drop.tienePin && drop.pin) ? ` Clave PIN: ${drop.pin}.` : '';
        const texto = `🔒 *Comunicación Confidencial (Casa Legal)*\nAccede a este mensaje seguro con autodestrucción en ${drop.tiempoSegundos} segundos:${pinAviso}\n\n👉 ${drop.url}`;
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    function formatTime(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    }

    function formatDate(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    async function handleDestruirManual(id) {
        if (confirm("¿Confirmas la autodestrucción inmediata de este enlace en el servidor? Nadie podrá volver a leerlo.")) {
            await purgarSecretoDefinitivo(id);
            if (secretoModal && secretoModal.id === id) {
                secretoModal.destruido = true;
                secretoModal.estado = 'DESTRUIDO';
            }
        }
    }
</script>

<svelte:head>
    <title>Chat Legal — Comunicaciones Confidenciales</title>
</svelte:head>

<!-- PANTALLA DE CAMUFLAJE / MODO DISCRETO -->
{#if modoPanico}
    <div class="fixed inset-0 z-[9999] bg-white text-slate-800 p-6 md:p-12 overflow-y-auto font-serif">
        <div class="w-full max-w-4xl mx-auto space-y-4" style="width: 100%; max-width: 900px;">
            <div class="flex justify-between items-center border-b pb-4">
                <div>
                    <h1 class="text-xl font-bold text-slate-900">Gaceta Judicial — Compendio Civil y Notarial</h1>
                    <p class="text-xs text-slate-500">De las Obligaciones y Contratos • Título I</p>
                </div>
                <button
                    onclick={() => modoPanico = false}
                    class="px-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                >
                    Volver al Sistema
                </button>
            </div>
            <div class="space-y-4 text-sm leading-relaxed text-justify text-slate-700">
                <p><strong>Artículo 450. (NOCIÓN DEL CONTRATO).</strong> Hay contrato cuando dos o más personas se ponen de acuerdo para constituir, modificar o extinguir entre sí una relación jurídica patrimonial.</p>
                <p><strong>Artículo 451. (NORMAS GENERALES DE LOS CONTRATOS).</strong> Las normas contenidas en este título son aplicables a todos los contratos, tengan o no denominación especial, sin perjuicio de las que se establezcan para algunos de ellos en particular y de las que resulten de su naturaleza.</p>
                <p><strong>Artículo 452. (ENUNCIACIÓN DE REQUISITOS).</strong> Son requisitos para la formación del contrato: 1. El consentimiento de las partes; 2. El objeto; 3. La causa; 4. La forma, siempre que sea legalmente exigible.</p>
            </div>
            <div class="pt-8 text-xs text-slate-400">
                Jurisprudencia y Doctrina Oficial • Presiona [Ctrl + Shift + X] para salir.
            </div>
        </div>
    </div>
{/if}

<!-- CONTENEDOR PRINCIPAL -->
<div class="h-full w-full bg-[#f8f9fa] text-[#1a1d1e] font-sans flex flex-col overflow-hidden">

    <!-- Header Superior Elegante -->
    <header class="px-4 md:px-6 py-3.5 border-b border-slate-200 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shrink-0 shadow-xs z-20">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-[#006a39]/10 text-[#006a39] flex items-center justify-center font-bold border border-[#006a39]/20 shadow-xs shrink-0">
                <span class="material-symbols-outlined text-[22px]">shield</span>
            </div>
            <div>
                <div class="flex items-center gap-2">
                    <h1 class="text-base font-bold text-slate-900 tracking-tight">Chat Legal</h1>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#c5a059]/15 text-[#8c6d23] border border-[#c5a059]/30 font-mono">
                        Secreto Profesional
                    </span>
                </div>
                <p class="text-xs text-slate-500">
                    Comunicaciones confidenciales, enlaces efímeros (3s-60s) y auditoría de accesos
                </p>
            </div>
        </div>

        <!-- Selector de Pestañas Responsive -->
        <div class="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl w-full md:w-auto overflow-x-auto custom-scrollbar shrink-0">
            <button
                type="button"
                onclick={() => { vistaActiva = 'chat'; mobileChatView = 'list'; }}
                class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap {vistaActiva === 'chat' ? 'bg-white text-[#006a39] shadow-xs' : 'text-slate-600 hover:text-slate-900'}"
            >
                <span class="material-symbols-outlined text-[17px]">chat</span>
                <span>Mensajes Internos</span>
            </button>

            <button
                type="button"
                onclick={() => vistaActiva = 'deaddrop'}
                class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap border {vistaActiva === 'deaddrop' ? 'bg-[#006a39] text-[#ffe08e] border-[#c5a059] shadow-sm' : 'bg-amber-50 text-amber-900 border-amber-300/80 hover:bg-amber-100'}"
            >
                <span class="material-symbols-outlined text-[17px] text-amber-600">local_fire_department</span>
                <span>Crear Enlace Seguro (3s-60s)</span>
            </button>

            <button
                type="button"
                onclick={() => vistaActiva = 'radar'}
                class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap {vistaActiva === 'radar' ? 'bg-white text-[#006a39] shadow-xs' : 'text-slate-600 hover:text-slate-900'}"
            >
                <span class="material-symbols-outlined text-[17px]">devices</span>
                <span>Dispositivos ({listaSecretos.filter(s => s.visto).length})</span>
            </button>

            <button
                type="button"
                onclick={() => modoPanico = true}
                class="px-2.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 transition-colors flex items-center gap-1 whitespace-nowrap"
                title="Modo Discreto (Ctrl + Shift + X)"
            >
                <span class="material-symbols-outlined text-[16px]">visibility_off</span>
                <span class="hidden lg:inline">Modo Discreto</span>
            </button>
        </div>
    </header>

    <!-- Contenido Según la Pestaña Activa -->
    <div class="flex-1 w-full flex flex-col overflow-hidden min-w-0">
        
        <!-- ======================================================== -->
        <!-- PESTAÑA 1: CHAT INTERNO ENTRE ABOGADOS (100% RESPONSIVE) -->
        <!-- ======================================================== -->
        {#if vistaActiva === 'chat'}
            <div class="flex-1 w-full h-full flex flex-col md:flex-row overflow-hidden min-w-0">
                
                <!-- Panel Izquierdo: Lista de Colegas y Abogados -->
                <div class="w-full md:w-[320px] bg-white border-r border-slate-200 flex-col shrink-0 {mobileChatView === 'chat' ? 'hidden md:flex' : 'flex'}">
                    
                    <!-- ACCESO DIRECTO ULTRA-DESTACADO: CREAR ENLACE SEGURO -->
                    <div class="p-3 bg-gradient-to-b from-[#006a39]/10 via-[#006a39]/5 to-transparent border-b border-slate-200">
                        <button
                            type="button"
                            onclick={() => vistaActiva = 'deaddrop'}
                            class="w-full p-3 rounded-2xl bg-gradient-to-r from-[#006a39] to-[#00542d] text-[#ffe08e] hover:shadow-md transition-all flex items-center justify-between group border border-[#c5a059]"
                            title="Generar un mensaje confidencial efímero con enlace seguro para clientes o contrapartes"
                        >
                            <div class="flex items-center gap-2.5">
                                <div class="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-amber-300">
                                    <span class="material-symbols-outlined text-[19px]">local_fire_department</span>
                                </div>
                                <div class="text-left">
                                    <div class="text-xs font-bold tracking-tight text-white flex items-center gap-1.5">
                                        <span>Crear Enlace Seguro</span>
                                        <span class="text-[9px] bg-[#c5a059] text-slate-900 px-1.5 py-0.2 rounded-full font-mono font-bold">3s-60s</span>
                                    </div>
                                    <div class="text-[10px] text-emerald-200">Para clientes o contrapartes</div>
                                </div>
                            </div>
                            <span class="material-symbols-outlined text-[18px] text-amber-300 group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                        </button>
                    </div>

                    <div class="p-3 border-b border-slate-100 bg-slate-50/50">
                        <div class="relative">
                            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                            <input
                                type="text"
                                bind:value={searchUserQuery}
                                placeholder="Buscar abogado o colega..."
                                class="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#006a39] focus:ring-1 focus:ring-[#006a39] outline-none transition-all shadow-2xs"
                            />
                        </div>
                    </div>
                    
                    <div class="flex-1 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                        {#if filteredEmpleados.length === 0}
                            <div class="p-6 text-center text-slate-500 space-y-3">
                                <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto border border-amber-200">
                                    <span class="material-symbols-outlined text-2xl">shield</span>
                                </div>
                                <p class="text-xs font-bold text-slate-800">No hay otros colegas registrados aún</p>
                                <p class="text-[11px] text-slate-500 leading-relaxed">
                                    Aun sin otros colegas registrados en el sistema, puedes generar enlaces seguros efímeros (autodestrucción en 3s-60s) para enviar a clientes por WhatsApp o Gmail:
                                </p>
                                <button
                                    type="button"
                                    onclick={() => vistaActiva = 'deaddrop'}
                                    class="w-full py-2.5 px-4 rounded-xl bg-[#006a39] text-[#ffe08e] font-bold text-xs border border-[#c5a059] shadow-xs hover:bg-[#00542d] transition-all inline-flex items-center justify-center gap-1.5"
                                >
                                    <span class="material-symbols-outlined text-[16px]">local_fire_department</span>
                                    <span>Generar Enlace Seguro Ahora</span>
                                </button>
                                <a 
                                    href="/dashboard/equipo"
                                    class="block text-[11px] font-bold text-[#006a39] hover:underline pt-1"
                                >
                                    + Registrar empleados en el equipo
                                </a>
                            </div>
                        {:else}
                            {#each filteredEmpleados as emp}
                                {@const isSelected = selectedUser && (selectedUser.authUid || selectedUser.id) === (emp.authUid || emp.id)}
                                <button
                                    type="button"
                                    onclick={() => selectUser(emp)}
                                    class="w-full p-3.5 text-left transition-all flex items-center gap-3 {isSelected ? 'bg-[#006a39]/10 border-l-4 border-[#006a39]' : 'hover:bg-slate-50'}"
                                >
                                    <div class="w-10 h-10 rounded-2xl {isSelected ? 'bg-[#006a39] text-white' : 'bg-slate-100 text-slate-700'} flex items-center justify-center font-bold text-sm border border-slate-200 shrink-0 shadow-2xs">
                                        {(emp.nombre || 'A').charAt(0).toUpperCase()}
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <div class="text-xs font-bold text-slate-900 truncate">{emp.nombre} {emp.apellidos || ''}</div>
                                        <div class="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                            <span>{emp.rol || 'Abogado'}</span>
                                        </div>
                                    </div>
                                </button>
                            {/each}
                        {/if}
                    </div>
                </div>

                <!-- Panel Derecho: Conversación Confidencial -->
                <div class="flex-1 flex flex-col h-full bg-[#fbfbfb] overflow-hidden {mobileChatView === 'list' ? 'hidden md:flex' : 'flex'}">
                    {#if selectedUser}
                        <!-- Header del Chat Activo -->
                        <div class="p-3.5 border-b border-slate-200 bg-white flex justify-between items-center shrink-0 shadow-2xs">
                            <div class="flex items-center gap-2.5">
                                <!-- Botón Volver en Móvil -->
                                <button
                                    type="button"
                                    onclick={() => mobileChatView = 'list'}
                                    class="md:hidden p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition-colors flex items-center gap-1 text-xs font-bold"
                                    title="Volver a la lista de contactos"
                                >
                                    <span class="material-symbols-outlined text-[20px]">arrow_back</span>
                                </button>

                                <div class="w-9 h-9 rounded-xl bg-[#006a39]/10 text-[#006a39] font-bold flex items-center justify-center text-sm border border-[#006a39]/20 shrink-0">
                                    {(selectedUser.nombre || 'A').charAt(0).toUpperCase()}
                                </div>
                                <div class="min-w-0">
                                    <div class="text-xs font-bold text-slate-900 truncate">
                                        {selectedUser.nombre} {selectedUser.apellidos || ''}
                                    </div>
                                    <div class="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        <span>Canal cifrado • {selectedUser.rol || 'Colega Legal'}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-center gap-2">
                                <button
                                    type="button"
                                    onclick={() => isPVDMode = !isPVDMode}
                                    class="px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 {isPVDMode ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}"
                                    title="Modo Efímero: los mensajes se autodestruyen 2s después de ser leídos"
                                >
                                    <span class="material-symbols-outlined text-[14px] {isPVDMode ? 'text-amber-700' : 'text-slate-400'}">local_fire_department</span>
                                    <span class="hidden sm:inline">{isPVDMode ? 'Efímero (2s) Activo' : 'Mensaje Efímero'}</span>
                                </button>

                                {#if selectedUser.email}
                                    <button
                                        type="button"
                                        onclick={() => avisarColegaPorGmail(selectedUser)}
                                        class="px-2.5 py-1 rounded-xl text-[11px] font-bold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-all flex items-center gap-1 shadow-2xs"
                                        title="Enviar aviso confidencial a su Gmail ({selectedUser.email})"
                                    >
                                        <span class="material-symbols-outlined text-[14px]">mail</span>
                                        <span class="hidden lg:inline">Avisar por Gmail</span>
                                    </button>
                                {/if}

                                <button
                                    type="button"
                                    onclick={() => vistaActiva = 'deaddrop'}
                                    class="px-2.5 py-1 rounded-xl text-[11px] font-bold border border-[#c5a059]/50 bg-[#006a39]/10 text-[#006a39] hover:bg-[#006a39]/20 transition-all flex items-center gap-1"
                                    title="Generar enlace seguro externo"
                                >
                                    <span class="material-symbols-outlined text-[14px]">link</span>
                                    <span class="hidden md:inline">Enlace Seguro</span>
                                </button>
                            </div>
                        </div>

                        <!-- Lista de Mensajes (Scrollable) -->
                        <div bind:this={chatContainer} class="flex-1 p-4 overflow-y-auto space-y-3.5 custom-scrollbar bg-slate-50/50">
                            {#if messages.length === 0}
                                <div class="flex flex-col items-center justify-center h-full text-slate-400 text-center p-6 space-y-2">
                                    <div class="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-xs">
                                        <span class="material-symbols-outlined text-2xl">chat_bubble_outline</span>
                                    </div>
                                    <p class="text-xs font-bold text-slate-700">Sin mensajes aún</p>
                                    <p class="text-[11px] text-slate-500" style="max-width: 320px;">Escribe abajo para iniciar una conversación protegida con {selectedUser.nombre}. Se le notificará a su correo y por alerta push.</p>
                                </div>
                            {:else}
                                {#each messages as msg}
                                    {@const isMine = msg.emisorId === myId}
                                    <div class="flex flex-col {isMine ? 'items-end' : 'items-start'}">
                                        <div class="max-w-[85%] sm:max-w-[70%] rounded-2xl p-3.5 text-xs shadow-xs {isMine ? 'bg-[#006a39] text-white rounded-tr-xs' : 'bg-white border border-slate-200/90 text-slate-800 rounded-tl-xs'}">
                                            
                                            {#if msg.isPVD}
                                                <div class="text-[10px] uppercase font-bold flex items-center gap-1 mb-1 {isMine ? 'text-amber-200' : 'text-amber-700'}">
                                                    <span class="material-symbols-outlined text-[13px]">local_fire_department</span>
                                                    <span>Efímero (Lectura Rápida)</span>
                                                </div>
                                            {/if}

                                            {#if msg.imageUrl}
                                                <div class="mb-2 rounded-xl overflow-hidden border border-black/10">
                                                    <img src={msg.imageUrl} alt="Adjunto" class="max-h-60 w-auto object-cover" />
                                                </div>
                                            {/if}

                                            <div class="leading-relaxed whitespace-pre-wrap select-text text-sm">
                                                {msg.texto}
                                            </div>

                                            <div class="mt-1 flex items-center justify-end gap-1 text-[10px] {isMine ? 'text-white/70' : 'text-slate-400'} font-mono">
                                                <span>{formatTime(msg.fechaEnvio || msg._localTimestamp)}</span>
                                                {#if isMine}
                                                    <span class="material-symbols-outlined text-[14px]">{msg.leido ? 'done_all' : 'done'}</span>
                                                {/if}
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                            {/if}
                        </div>

                        <!-- Barra de Redacción de Mensaje -->
                        <form onsubmit={handleSendMessage} class="p-3 border-t border-slate-200 bg-white flex items-center gap-2 shrink-0">
                            <input
                                type="file"
                                accept="image/*"
                                bind:this={fileInputRef}
                                onchange={(e) => imageFile = e.target.files[0]}
                                class="hidden"
                            />
                            
                            <button
                                type="button"
                                onclick={() => fileInputRef?.click()}
                                class="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors shrink-0"
                                title="Adjuntar fotografía o comprobante"
                            >
                                <span class="material-symbols-outlined text-[18px]">attach_file</span>
                            </button>

                            <button
                                type="button"
                                onclick={() => vistaActiva = 'deaddrop'}
                                class="p-2.5 rounded-xl border border-[#c5a059]/40 bg-amber-50/50 hover:bg-amber-100/70 text-amber-900 transition-colors shrink-0 flex items-center gap-1"
                                title="Crear enlace efímero autodestructible para este u otro cliente"
                            >
                                <span class="material-symbols-outlined text-[18px] text-amber-700">local_fire_department</span>
                            </button>

                            {#if imageFile}
                                <span class="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-lg truncate max-w-[120px]">
                                    {imageFile.name}
                                </span>
                            {/if}

                            <input
                                type="text"
                                bind:value={currentMessage}
                                placeholder="Escribe un mensaje confidencial (se enviará aviso a su correo)..."
                                class="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#006a39] focus:ring-1 focus:ring-[#006a39] outline-none transition-all"
                            />

                            <button
                                type="submit"
                                disabled={isSending}
                                class="px-4 py-2.5 rounded-xl bg-[#006a39] text-white font-bold text-xs hover:bg-[#00542d] transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 shrink-0"
                            >
                                {#if isSending}
                                    <span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                {:else}
                                    <span class="material-symbols-outlined text-[16px]">send</span>
                                    <span class="hidden sm:inline">Enviar</span>
                                {/if}
                            </button>
                        </form>
                    {:else}
                        <!-- Estado Vacío: Panel de Bienvenida y Acciones Rápidas -->
                        <div class="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center mx-auto space-y-6 w-full" style="width: 100%; max-width: 700px;">
                            <div class="w-16 h-16 rounded-3xl bg-[#006a39]/10 text-[#006a39] flex items-center justify-center border border-[#006a39]/20 shadow-sm">
                                <span class="material-symbols-outlined text-3xl">verified_user</span>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-slate-900 font-serif">Módulo de Chat Legal & Seguridad</h3>
                                <p class="text-xs text-slate-600 mt-1 leading-relaxed mx-auto" style="max-width: 520px;">
                                    Canales protegidos con secreto profesional, enlaces efímeros autodestructibles (3s-60s), rescate forense de dispositivos y notificaciones push automáticas a Gmail.
                                </p>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                                <!-- Opción 1: Crear Enlace Seguro -->
                                <button
                                    type="button"
                                    onclick={() => vistaActiva = 'deaddrop'}
                                    class="p-5 rounded-2xl bg-white border-2 border-[#c5a059] hover:border-[#006a39] shadow-sm hover:shadow-md transition-all text-left group flex flex-col justify-between"
                                >
                                    <div>
                                        <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                                            <span class="material-symbols-outlined text-2xl">local_fire_department</span>
                                        </div>
                                        <h4 class="text-xs font-bold text-slate-900 uppercase tracking-tight">Crear Enlace Seguro</h4>
                                        <p class="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                            Genera un enlace para clientes o juzgados que se autodestruye en 3s-60s y rescata datos forenses del receptor.
                                        </p>
                                    </div>
                                    <div class="mt-4 flex items-center gap-1 text-xs font-bold text-[#006a39]">
                                        <span>Generar enlace efímero</span>
                                        <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
                                    </div>
                                </button>

                                <!-- Opción 2: Chatear con Colegas -->
                                <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm text-left flex flex-col justify-between">
                                    <div>
                                        <div class="w-10 h-10 rounded-xl bg-emerald-50 text-[#006a39] flex items-center justify-center mb-3">
                                            <span class="material-symbols-outlined text-2xl">chat</span>
                                        </div>
                                        <h4 class="text-xs font-bold text-slate-900 uppercase tracking-tight">Chat con el Equipo Legal</h4>
                                        <p class="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                            Selecciona un colega del panel lateral para coordinar casos con autodestrucción y aviso a su correo Gmail.
                                        </p>
                                    </div>
                                    <div class="mt-4 text-[11px] text-slate-400 font-mono">
                                        Cifrado de extremo a extremo
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>

        <!-- ======================================================== -->
        <!-- PESTAÑA 2: CREAR ENLACE SEGURO (DEAD DROP EFÍMERO)       -->
        <!-- ======================================================== -->
        {:else if vistaActiva === 'deaddrop'}
            <div class="flex-1 w-full h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
                <div class="max-w-4xl mx-auto w-full space-y-6 pb-12" style="width: 100%; max-width: 900px; min-width: 0;">
                
                <div class="bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-sm space-y-5" style="width: 100%;">
                    <div class="flex items-center gap-3.5">
                        <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                            <span class="material-symbols-outlined text-2xl">local_fire_department</span>
                        </div>
                        <div>
                            <h2 class="text-base font-bold text-slate-900 tracking-tight">
                                Generador de Enlace Seguro y Efímero
                            </h2>
                            <p class="text-xs text-slate-500">
                                Redacta un mensaje confidencial que se autodestruirá automáticamente en los segundos que elijas tras ser abierto. Rescata de forma silenciosa la telemetría del dispositivo que lo abrió.
                            </p>
                        </div>
                    </div>

                    <form onsubmit={handleCrearDeadDrop} class="space-y-4 pt-2">
                        <div>
                            <label for="dropTexto" class="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                                Mensaje Confidencial / Secreto Procesal
                            </label>
                            <textarea
                                id="dropTexto"
                                bind:value={dropTexto}
                                rows="3"
                                placeholder="Escribe el mensaje o dato confidencial aquí. Al abrir el enlace, el destinatario verá un cronómetro regresivo y luego desaparecerá para siempre..."
                                class="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#006a39] focus:ring-1 focus:ring-[#006a39] outline-none transition-all font-serif leading-relaxed"
                            ></textarea>
                        </div>

                        <!-- Adjuntos Multimedia: Nota de Voz / Audio, Imagen o Cualquier Archivo -->
                        <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[18px] text-[#006a39]">attach_file</span>
                                    <span>Adjuntar Audio, Imagen o Archivo (Opcional)</span>
                                </span>
                                {#if dropFile || recordedAudioBlob}
                                    <span class="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-300">
                                        ✓ Archivo listo para cifrar
                                    </span>
                                {/if}
                            </div>

                            <!-- Botones de Acción para Subir o Grabar -->
                            <div class="flex flex-wrap items-center gap-2">
                                <!-- Botón Subir Archivo / Imagen -->
                                <input
                                    type="file"
                                    bind:this={dropFileInputRef}
                                    onchange={handleDropFileChange}
                                    accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
                                    class="hidden"
                                    id="dropFileInput"
                                />
                                <button
                                    type="button"
                                    onclick={() => dropFileInputRef?.click()}
                                    class="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:border-[#006a39] text-slate-700 hover:text-[#006a39] text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                                >
                                    <span class="material-symbols-outlined text-[17px] text-[#006a39]">upload_file</span>
                                    <span>Subir Imagen o Documento</span>
                                </button>

                                <!-- Botón Grabar Nota de Voz con Micrófono -->
                                {#if !isRecordingVoice && !recordedAudioBlob}
                                    <button
                                        type="button"
                                        onclick={startVoiceRecording}
                                        class="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:border-red-400 text-slate-700 hover:text-red-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                                    >
                                        <span class="material-symbols-outlined text-[17px] text-red-600">mic</span>
                                        <span>Grabar Nota de Voz</span>
                                    </button>
                                {:else if isRecordingVoice}
                                    <div class="flex items-center gap-2 bg-red-50 border border-red-300 px-3 py-1.5 rounded-xl shadow-2xs">
                                        <span class="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
                                        <span class="text-xs font-mono font-bold text-red-700">
                                            Grabando: 00:{String(recordingDuration).padStart(2, '0')}s
                                        </span>
                                        <button
                                            type="button"
                                            onclick={stopVoiceRecording}
                                            class="ml-2 px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold text-[11px] hover:bg-red-700 transition-colors"
                                        >
                                            Listo
                                        </button>
                                        <button
                                            type="button"
                                            onclick={cancelVoiceRecording}
                                            class="px-2 py-1 rounded-lg text-slate-500 hover:text-slate-800 text-[11px]"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                {/if}
                            </div>

                            <!-- Vista Previa de Archivo Adjunto -->
                            {#if dropFile}
                                <div class="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                                    <div class="flex items-center gap-2.5 min-w-0">
                                        {#if dropFilePreview}
                                            <img src={dropFilePreview} alt="Preview" class="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0" />
                                        {:else}
                                            <div class="w-10 h-10 rounded-lg bg-[#006a39]/10 text-[#006a39] flex items-center justify-center shrink-0">
                                                <span class="material-symbols-outlined text-[20px]">description</span>
                                            </div>
                                        {/if}
                                        <div class="min-w-0">
                                            <p class="text-xs font-bold text-slate-800 truncate">{dropFile.name}</p>
                                            <p class="text-[10px] text-slate-400 font-mono">{(dropFile.size / 1024).toFixed(1)} KB</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onclick={removeDropFile}
                                        class="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                        title="Quitar archivo"
                                    >
                                        <span class="material-symbols-outlined text-[18px]">close</span>
                                    </button>
                                </div>
                            {/if}

                            <!-- Vista Previa de Audio Grabado -->
                            {#if recordedAudioBlob && recordedAudioUrl}
                                <div class="p-2.5 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between gap-3">
                                    <div class="flex items-center gap-2.5 min-w-0 flex-1">
                                        <span class="material-symbols-outlined text-amber-700 text-xl shrink-0">mic</span>
                                        <div class="flex-1 min-w-0">
                                            <span class="text-xs font-bold text-amber-900 block truncate">Nota de voz ({recordingDuration}s)</span>
                                            <audio controls src={recordedAudioUrl} class="w-full mt-1 h-7"></audio>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onclick={cancelVoiceRecording}
                                        class="p-1 rounded-lg text-amber-700 hover:text-red-600 hover:bg-red-50 transition-colors"
                                        title="Eliminar audio"
                                    >
                                        <span class="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                </div>
                            {/if}
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <!-- Selector de Tiempo de Autodestrucción -->
                            <div>
                                <label class="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                                    Tiempo de Visualización
                                </label>
                                <div class="grid grid-cols-6 gap-1">
                                    {#each [3, 5, 10, 30, 60, 120] as seg}
                                        <button
                                            type="button"
                                            onclick={() => dropTiempo = seg}
                                            class="py-2.5 rounded-xl font-mono text-xs font-bold border transition-all {dropTiempo === seg ? 'bg-[#006a39] text-[#ffe08e] border-[#c5a059] shadow-xs' : 'bg-white border-slate-200 text-slate-700 hover:border-[#006a39]/40'}"
                                        >
                                            {seg < 60 ? `${seg}s` : `${seg / 60}m`}
                                        </button>
                                    {/each}
                                </div>
                                <span class="text-[10px] text-slate-500 mt-1.5 block">
                                    El receptor verá una cuenta regresiva ({dropTiempo}s) y el texto/archivos se purgarán definitivamente.
                                </span>
                            </div>

                            <!-- PIN Opcional -->
                            <div>
                                <label for="dropPin" class="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                                    PIN Opcional de Seguridad
                                </label>
                                <input
                                    id="dropPin"
                                    type="text"
                                    bind:value={dropPin}
                                    placeholder="Ej. 1234 (Opcional)"
                                    maxlength="8"
                                    class="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-3.5 text-xs text-slate-800 font-mono focus:bg-white focus:border-[#006a39] focus:ring-1 focus:ring-[#006a39] outline-none"
                                />
                                <span class="text-[10px] text-slate-500 mt-1.5 block">
                                    Si añades un PIN, el receptor deberá digitarlo para desbloquear la lectura.
                                </span>
                            </div>
                        </div>

                        <!-- Envío directo por Gmail / Correo (Opcional) -->
                        <div class="p-4 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-3">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-[18px] text-[#006a39]">mail</span>
                                <span class="text-xs font-bold text-slate-800 uppercase">
                                    Envío Directo a Correo / Gmail (Opcional)
                                </span>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label for="dropDestinatarioNombre" class="block text-[11px] font-bold text-slate-600 mb-1">Nombre del Destinatario</label>
                                    <input
                                        id="dropDestinatarioNombre"
                                        type="text"
                                        bind:value={dropDestinatarioNombre}
                                        placeholder="Ej. Dr. Mario Suárez (Cliente)"
                                        class="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 outline-none focus:border-[#006a39]"
                                    />
                                </div>
                                <div>
                                    <label for="dropDestinatarioEmail" class="block text-[11px] font-bold text-slate-600 mb-1">Correo Electrónico / Gmail</label>
                                    <input
                                        id="dropDestinatarioEmail"
                                        type="email"
                                        bind:value={dropDestinatarioEmail}
                                        placeholder="cliente@gmail.com"
                                        class="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 outline-none focus:border-[#006a39]"
                                    />
                                </div>
                            </div>
                            
                            <label class="flex items-center gap-2 cursor-pointer select-none pt-1">
                                <input
                                    type="checkbox"
                                    bind:checked={autoAbrirGmail}
                                    class="w-4 h-4 rounded text-[#006a39] focus:ring-[#006a39] border-slate-300"
                                />
                                <span class="text-xs text-slate-700">
                                    Abrir automáticamente el redactor de Gmail en nueva pestaña al crear el enlace
                                </span>
                            </label>
                        </div>

                        <div class="pt-2 flex justify-end">
                            <button
                                type="submit"
                                disabled={isCreandoDrop}
                                class="w-full sm:w-auto px-8 py-3 rounded-xl bg-[#006a39] text-[#ffe08e] border border-[#c5a059] font-bold text-xs uppercase tracking-wider hover:bg-[#00542d] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                            >
                                {#if isCreandoDrop}
                                    <span class="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                    Cifrando y Subiendo...
                                {:else}
                                    <span class="material-symbols-outlined text-[16px]">link</span>
                                    Generar Enlace Seguro (3s - 60s)
                                {/if}
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Tarjeta del Enlace Generado y Vista Previa de lo Escrito -->
                {#if dropGenerado}
                    <div class="bg-white border-2 border-[#c5a059] p-6 rounded-3xl shadow-lg space-y-4 animate-fade-in">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-bold uppercase tracking-wider text-[#006a39] flex items-center gap-2">
                                <span class="material-symbols-outlined text-[18px]">verified</span>
                                Enlace Confidencial Creado con Éxito
                            </span>
                            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                                {dropGenerado.tiempoSegundos} SEGUNDOS DE VIDA
                            </span>
                        </div>

                        <!-- Texto que redactó el abogado para que siempre lo vea -->
                        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Contenido que redactaste:
                            </span>
                            <p class="text-xs text-slate-800 font-serif whitespace-pre-wrap leading-relaxed">
                                "{dropGenerado.texto}"
                            </p>
                        </div>

                        <!-- Archivo Adjunto si existe -->
                        {#if dropGenerado.archivo}
                            <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5">
                                <span class="material-symbols-outlined text-emerald-800 text-xl">
                                    {dropGenerado.archivo.tipo?.startsWith('audio/') ? 'mic' : (dropGenerado.archivo.tipo?.startsWith('image/') ? 'image' : 'description')}
                                </span>
                                <div class="text-xs">
                                    <span class="font-bold text-emerald-900">Adjunto Cifrado: </span>
                                    <span class="text-slate-800">{dropGenerado.archivo.nombre}</span>
                                    <span class="text-[10px] text-slate-500 font-mono ml-1">({(dropGenerado.archivo.size / 1024).toFixed(1)} KB)</span>
                                </div>
                            </div>
                        {/if}

                        <!-- URL Generada -->
                        <div class="space-y-1.5">
                            <label for="generatedUrl" class="block text-[11px] font-bold text-slate-600 uppercase">
                                Enlace para Compartir con el Cliente o Receptor:
                            </label>
                            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <input
                                    id="generatedUrl"
                                    type="text"
                                    readonly
                                    value={dropGenerado.url}
                                    class="flex-1 bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono text-slate-800 select-all outline-none"
                                />
                                <button
                                    type="button"
                                    onclick={() => copiarLinkDrop(dropGenerado.url)}
                                    class="px-4 py-2 rounded-xl bg-[#006a39] text-white font-bold text-xs hover:bg-[#00542d] transition-all flex items-center justify-center gap-1.5 shadow-xs shrink-0"
                                >
                                    <span class="material-symbols-outlined text-[15px]">{linkCopiado ? 'done' : 'content_copy'}</span>
                                    <span>{linkCopiado ? '¡Copiado!' : 'Copiar'}</span>
                                </button>
                                <a
                                    href={dropGenerado.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition-all flex items-center justify-center gap-1 shrink-0"
                                >
                                    <span class="material-symbols-outlined text-[15px]">open_in_new</span>
                                    Probar
                                </a>
                            </div>
                        </div>

                        <!-- Acciones Directas: Gmail y WhatsApp -->
                        <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <span class="text-xs font-bold text-slate-800 block">Despachar Notificación:</span>
                                {#if dropGenerado.destinatarioEmail}
                                    <span class="text-[11px] text-slate-500 font-mono">Destino: {dropGenerado.destinatarioEmail}</span>
                                {/if}
                            </div>
                            <div class="flex items-center gap-2">
                                <button
                                    type="button"
                                    onclick={() => compartirPorGmail(dropGenerado)}
                                    class="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 text-white hover:from-red-700 hover:to-amber-700 font-bold text-xs transition-all flex items-center gap-2 shadow-sm"
                                    title="Abrir redactor de Gmail con el enlace y asunto listos"
                                >
                                    <span class="material-symbols-outlined text-[16px]">mail</span>
                                    <span>{dropGenerado.destinatarioEmail ? `Enviar a Gmail` : 'Abrir en Gmail'}</span>
                                </button>

                                <button
                                    type="button"
                                    onclick={() => compartirPorWhatsApp(dropGenerado)}
                                    class="px-3.5 py-2 rounded-xl bg-[#25D366]/10 border border-[#25D366]/40 hover:bg-[#25D366]/20 text-[#128C7E] font-bold text-xs transition-all flex items-center gap-1.5 shadow-2xs"
                                    title="Compartir por WhatsApp"
                                >
                                    <span class="material-symbols-outlined text-[16px]">chat</span>
                                    <span>WhatsApp</span>
                                </button>
                            </div>
                        </div>



                        <p class="text-[11px] text-slate-500 leading-relaxed">
                            Envía este enlace por WhatsApp o Gmail. En cuanto el destinatario lo abra, el sistema registrará silenciosamente la telemetría forense de su dispositivo en la pestaña <strong>Dispositivos</strong> y el mensaje se destruirá de los servidores.
                        </p>
                    </div>
                {/if}

                </div>
            </div>

        <!-- ======================================================== -->
        <!-- PESTAÑA 3: AUDITORÍA DE DISPOSITIVOS E INTERCEPCIONES    -->
        <!-- ======================================================== -->
        {:else if vistaActiva === 'radar'}
            <div class="flex-1 w-full h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
                <div class="max-w-4xl mx-auto w-full space-y-6 pb-12" style="width: 100%; max-width: 900px;">
                
                <div class="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm">
                    <div class="flex justify-between items-center mb-4">
                        <div>
                            <h2 class="text-base font-bold text-slate-900 tracking-tight">
                                Auditoría de Enlaces y Dispositivos
                            </h2>
                            <p class="text-xs text-slate-500">
                                Registro en tiempo real de todos los enlaces confidenciales generados y los dispositivos que accedieron a ellos.
                            </p>
                        </div>
                        <span class="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-700">
                            {listaSecretos.length} generados
                        </span>
                    </div>

                    {#if listaSecretos.length === 0}
                        <div class="p-12 text-center text-slate-400 space-y-2">
                            <span class="material-symbols-outlined text-4xl text-slate-300">devices</span>
                            <p class="text-xs font-bold text-slate-600">No hay enlaces generados aún</p>
                            <p class="text-[11px] text-slate-400">Crea un enlace en la pestaña "Crear Enlace Seguro" para ver aquí el registro del dispositivo que lo abra.</p>
                        </div>
                    {:else}
                        <div class="space-y-3">
                            {#each listaSecretos as sec}
                                <div class="p-4 rounded-2xl border transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 {sec.visto ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50/60 border-slate-200'}">
                                    <div class="min-w-0 flex-1 space-y-1">
                                        <div class="flex items-center gap-2">
                                            <span class="w-2 h-2 rounded-full {sec.visto ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}"></span>
                                            <span class="font-bold text-xs text-slate-900">
                                                ID: {sec.id.slice(0, 8)}...
                                            </span>
                                            <span class="text-[10px] px-2 py-0.5 rounded-md font-mono font-bold {sec.visto ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                                                {sec.visto ? 'ABIERTO / INTERCEPTADO' : 'PENDIENTE DE APERTURA'}
                                            </span>
                                            {#if sec.destruido}
                                                <span class="text-[10px] px-2 py-0.5 rounded-md font-mono bg-slate-200 text-slate-700 font-bold">
                                                    PURGADO
                                                </span>
                                            {/if}
                                        </div>

                                        <div class="text-[11px] text-slate-600">
                                            {#if sec.datosDispositivo}
                                                <strong class="text-[#006a39]">{sec.datosDispositivo.dispositivoEstimado}</strong> • IP: {sec.datosDispositivo.ipPublica} • Batería: {sec.datosDispositivo.nivelBateria}
                                            {:else}
                                                Esperando a que el destinatario abra el enlace...
                                            {/if}
                                        </div>

                                        <div class="text-[10px] text-slate-400 font-mono">
                                            Creado: {formatDate(sec.creadoEn)} • Autodestrucción configurada: {sec.tiempoSegundos}s
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                                        {#if sec.datosDispositivo}
                                            <button
                                                type="button"
                                                onclick={() => secretoModal = sec}
                                                class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all shadow-2xs flex items-center gap-1"
                                            >
                                                <span class="material-symbols-outlined text-[15px]">info</span>
                                                Ficha Forense
                                            </button>
                                        {/if}

                                        {#if !sec.destruido}
                                            <button
                                                type="button"
                                                onclick={() => handleDestruirManual(sec.id)}
                                                class="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold transition-colors"
                                                title="Destruir enlace ahora"
                                            >
                                                Destruir
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>

                </div>
            </div>
        {/if}

    </div>

</div>

<!-- MODAL: FICHA FORENSE DE TELEMETRÍA DEL DISPOSITIVO -->
{#if secretoModal && secretoModal.datosDispositivo}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4" onclick={() => secretoModal = null}>
        <div class="bg-white rounded-3xl border border-slate-200 w-full p-6 shadow-2xl space-y-4" style="width: 100%; max-width: 560px;" onclick={(e) => e.stopPropagation()}>
            <div class="flex justify-between items-center pb-3 border-b border-slate-100">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-emerald-600">smartphone</span>
                    <h3 class="font-bold text-sm text-slate-900">Datos Forenses del Dispositivo Interceptado</h3>
                </div>
                <button onclick={() => secretoModal = null} class="text-slate-400 hover:text-slate-700">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <div class="grid grid-cols-2 gap-3 text-xs font-mono">
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="text-[10px] text-slate-400 block mb-0.5">Dispositivo Estimado</span>
                    <span class="font-bold text-slate-800">{secretoModal.datosDispositivo.dispositivoEstimado}</span>
                </div>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="text-[10px] text-slate-400 block mb-0.5">Dirección IP Pública</span>
                    <span class="font-bold text-[#006a39]">{secretoModal.datosDispositivo.ipPublica}</span>
                </div>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="text-[10px] text-slate-400 block mb-0.5">Batería</span>
                    <span class="font-bold text-slate-800">{secretoModal.datosDispositivo.nivelBateria} ({secretoModal.datosDispositivo.cargandoBateria ? 'Cargando' : 'Descargando'})</span>
                </div>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="text-[10px] text-slate-400 block mb-0.5">Resolución de Pantalla</span>
                    <span class="font-bold text-slate-800">{secretoModal.datosDispositivo.resolucionPantalla}</span>
                </div>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="text-[10px] text-slate-400 block mb-0.5">Tipo de Red</span>
                    <span class="font-bold text-slate-800">{secretoModal.datosDispositivo.tipoConexion} ({secretoModal.datosDispositivo.velocidadDownlink})</span>
                </div>
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="text-[10px] text-slate-400 block mb-0.5">Hardware (CPU / RAM)</span>
                    <span class="font-bold text-slate-800">{secretoModal.datosDispositivo.nucleosCpu} núcleos • {secretoModal.datosDispositivo.memoriaRamGiga}</span>
                </div>
                <div class="col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="text-[10px] text-slate-400 block mb-0.5">Zona Horaria & Fecha de Acceso</span>
                    <span class="font-bold text-slate-800">{secretoModal.datosDispositivo.zonaHoraria} • {formatDate(secretoModal.fechaApertura)}</span>
                </div>
            </div>

            <div class="pt-3 border-t border-slate-100 flex justify-end">
                <button
                    type="button"
                    onclick={() => secretoModal = null}
                    class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold transition-colors"
                >
                    Cerrar Ficha
                </button>
            </div>
        </div>
    </div>
{/if}
