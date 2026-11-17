<script>
    import { onMount } from "svelte";
    import { authStore } from "$lib/stores/auth.js";
    import {
        empresaStore,
        PRESETS_FIRMAS,
        generarSlugFirma,
    } from "$lib/stores/empresa.js";
    import { optimizeAndUploadLogo } from "$lib/utils/imageOptimizer.js";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { db, storage } from "$lib/firebase/client.js";
    import {
        doc,
        updateDoc,
        collection,
        query,
        where,
        getDocs,
    } from "firebase/firestore";
    import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
    import { generarInformeGeneral } from "$lib/pdf/generador.js";
    import { getActiveTenantId } from "$lib/firebase/tenant.js";

    let isAdministrador = $derived(
        $authStore.profile?.nivelAcceso === "admin" ||
            $authStore.profile?.role === "admin" ||
            $authStore.profile?.rol === "Administrador",
    );
    let isGeneratingPdf = $state(false);

    // Tab Navigation
    let activeSettingsTab = $state("perfil"); // 'perfil' | 'duplicar' | 'presentacion'

    $effect(() => {
        const tabParam = $page.url.searchParams.get("tab");
        if (
            tabParam &&
            ["perfil", "duplicar", "presentacion"].includes(tabParam)
        ) {
            if (tabParam === "duplicar" && (getActiveTenantId() || !isAdministrador)) {
                activeSettingsTab = "perfil";
            } else if (tabParam === "presentacion" && !isAdministrador) {
                activeSettingsTab = "perfil";
            } else {
                activeSettingsTab = tabParam;
            }
        }
    });

    // Form Profile
    let isSaving = $state(false);
    let isUploading = $state(false);
    let saved = $state(false);
    let perfilLogoInput = $state(null);
    let isUploadingLogoPerfil = $state(false);

    let formData = $state({
        name: $authStore.profile?.name || $authStore.profile?.nombre || "",
        email:
            $authStore.profile?.email ||
            $authStore.user?.email ||
            $empresaStore?.email ||
            "",
        phone: $authStore.profile?.phone || $authStore.profile?.telefono || "",
        title:
            $authStore.profile?.title || $authStore.profile?.cargo || "Abogado",
        photoURL:
            $authStore.profile?.photoURL ||
            "https://www.gravatar.com/avatar/0?d=mp&f=y",
        guide: $authStore.profile?.guide || "",
    });

    $effect(() => {
        if ($authStore.profile && formData.name === "") {
            formData.name =
                $authStore.profile.name || $authStore.profile.nombre || "";
            formData.email =
                $authStore.profile.email ||
                $authStore.user?.email ||
                $empresaStore?.email ||
                "";
            formData.phone =
                $authStore.profile.phone || $authStore.profile.telefono || "";
            formData.title =
                $authStore.profile.title ||
                $authStore.profile.cargo ||
                "Abogado";
            formData.photoURL =
                $authStore.profile.photoURL ||
                "https://www.gravatar.com/avatar/0?d=mp&f=y";
            formData.guide = $authStore.profile.guide || "";
        }
    });

    // ==========================================
    // DUPLICAR APP / MARCA BLANCA STATE
    // ==========================================
    let isRestoringMaster = $state(false);
    let restoreMasterMsg = $state("");

    async function handleRestablecerCasaLegal() {
        if (!confirm("¿Deseas restablecer completamente la configuración original de CASA LEGAL (nombre, subtítulo, colores verde/dorado y logo)? Esta acción asegura que el sistema maestro vuelva a su estado original.")) return;
        isRestoringMaster = true;
        try {
            await empresaStore.restablecerCasaLegalConfig();
            restoreMasterMsg = "¡Casa Legal Master restablecida correctamente!";
            setTimeout(() => restoreMasterMsg = "", 4000);
        } catch(e) {
            console.error("Error al restablecer Casa Legal:", e);
        } finally {
            isRestoringMaster = false;
        }
    }

    let firmaConfig = $state({
        slug: "",
        nombre: $empresaStore?.nombre || "CASA LEGAL",
        subtitulo: $empresaStore?.subtitulo || "Firma Jurídica e Inmobiliaria",
        eslogan:
            $empresaStore?.eslogan ||
            "Excelencia, Estrategia y Seguridad Jurídica",
        logoUrl: $empresaStore?.logoUrl || "",
        moneda: $empresaStore?.moneda || "Bs.",
        colorPrimario: $empresaStore?.colorPrimario || "#006a39",
        colorSecundario: $empresaStore?.colorSecundario || "#c5a059",
        colorFondo: $empresaStore?.colorFondo || "#f8f9ff",
        colorSidebar: $empresaStore?.colorSidebar || "#1a1d1e",
        telefono: $empresaStore?.telefono || "+591 70000000",
        email: $empresaStore?.email || "contacto@firma.com",
        direccion: $empresaStore?.direccion || "Av. Principal #100, Piso 4",
        ciudad: $empresaStore?.ciudad || "Santa Cruz, Bolivia",
        nit: $empresaStore?.nit || "1029384756",
        registroNotarial:
            $empresaStore?.registroNotarial || "Reg. Forense #4892",
        piePagina:
            $empresaStore?.piePagina ||
            "Sistema integral de gestión jurídica y financiera. Confidencial.",
    });

    let isUploadingLogo = $state(false);
    let isSavingFirma = $state(false);
    let savedFirmaMsg = $state("");
    let logoFileInput = $state(null);
    let jsonFileInput = $state(null);
    let listaFirmasDuplicadas = $state([]);

    // Formulario del Administrador General de la Firma Duplicada
    let adminData = $state({
        nombre: "Dr. Alejandro Torrez",
        cargo: "Socio Director General",
        email: "admin@torrezabogados.bo",
        password: "",
        telefono: "+591 71234567",
    });
    let directAdminLink = $state("");
    let showPassword = $state(false);
    let linkCopiado = $state(false);
    let credsCopiadas = $state(false);

    function generarPasswordSegura() {
        const chars =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
        const firmaWord = (firmaConfig.nombre || "Lex")
            .replace(/[^a-zA-Z]/g, "")
            .slice(0, 4);
        let randomPart = "";
        for (let i = 0; i < 6; i++) {
            randomPart += chars.charAt(
                Math.floor(Math.random() * chars.length),
            );
        }
        adminData.password = `${firmaWord}#2026!${randomPart}`;
    }

    async function cargarFirmasDuplicadas() {
        try {
            listaFirmasDuplicadas = await empresaStore.listarFirmasDuplicadas();
        } catch (e) {
            console.warn("Error cargando firmas:", e);
        }
    }

    onMount(() => {
        generarPasswordSegura();
        firmaConfig.slug = generarSlugFirma(firmaConfig.nombre);
        if (typeof window !== "undefined") {
            const origin = window.location.origin;
            directAdminLink = `${origin}/${firmaConfig.slug}`;
        }
        cargarFirmasDuplicadas();
    });

    function copiarLinkDirecto() {
        if (!directAdminLink) return;
        navigator.clipboard.writeText(directAdminLink);
        linkCopiado = true;
        setTimeout(() => (linkCopiado = false), 2000);
    }

    function copiarCredenciales() {
        const texto = `CREDENTIALS ACCESO:\nPortal: ${firmaConfig.nombre}\nEnlace: ${directAdminLink}\nUsuario / Email: ${adminData.email}\nContraseña: ${adminData.password}\nRol: Administrador General`;
        navigator.clipboard.writeText(texto);
        credsCopiadas = true;
        setTimeout(() => (credsCopiadas = false), 2000);
    }

    $effect(() => {
        if ($empresaStore) {
            firmaConfig.nombre = $empresaStore.nombre;
            firmaConfig.subtitulo = $empresaStore.subtitulo;
            firmaConfig.eslogan = $empresaStore.eslogan;
            firmaConfig.logoUrl = $empresaStore.logoUrl;
            firmaConfig.moneda = $empresaStore.moneda;
            firmaConfig.colorPrimario = $empresaStore.colorPrimario;
            firmaConfig.colorSecundario = $empresaStore.colorSecundario;
            firmaConfig.colorFondo = $empresaStore.colorFondo;
            firmaConfig.colorSidebar = $empresaStore.colorSidebar;
            firmaConfig.telefono = $empresaStore.telefono;
            firmaConfig.email = $empresaStore.email;
            firmaConfig.direccion = $empresaStore.direccion;
            firmaConfig.ciudad = $empresaStore.ciudad;
            firmaConfig.nit = $empresaStore.nit;
            firmaConfig.registroNotarial = $empresaStore.registroNotarial;
            firmaConfig.piePagina = $empresaStore.piePagina;
        }
    });

    async function saveSettings() {
        isSaving = true;
        saved = false;
        try {
            authStore.updateProfile({
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                title: formData.title,
                photoURL: formData.photoURL,
                guide: formData.guide,
            });

            const uid = $authStore.user?.uid;
            if (uid) {
                const q = query(
                    collection(db, "empleados"),
                    where("authUid", "==", uid),
                );
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const docId = querySnapshot.docs[0].id;
                    await updateDoc(doc(db, "empleados", docId), {
                        name: formData.name,
                        nombre: formData.name,
                        email: formData.email,
                        phone: formData.phone,
                        telefono: formData.phone,
                        title: formData.title,
                        cargo: formData.title,
                        photoURL: formData.photoURL,
                        guide: formData.guide,
                    });
                } else {
                    await updateDoc(doc(db, "users", uid), {
                        name: formData.name,
                        email: formData.email,
                        phone: formData.phone,
                        title: formData.title,
                        photoURL: formData.photoURL,
                        guide: formData.guide,
                    });
                }
            }

            // Si es administrador general, sincronizar con la empresa para que las alertas lleguen a este correo
            if (isAdministrador && formData.email) {
                await empresaStore.guardarConfiguracion({
                    ...$empresaStore,
                    email: formData.email,
                });
            }

            saved = true;
            setTimeout(() => (saved = false), 3000);
        } catch (e) {
            console.error("Error guardando settings:", e);
            alert("Error al guardar cambios");
        } finally {
            isSaving = false;
        }
    }

    async function handleFileSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        isUploading = true;
        try {
            const fileName = `perfiles/${$authStore.user?.uid}_${Date.now()}`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);
            formData.photoURL = downloadUrl;
        } catch (error) {
            console.error("Error subiendo foto:", error);
            alert("Ocurrió un error al subir la foto.");
        } finally {
            isUploading = false;
        }
    }

    async function handleUploadLogo(event) {
        const file = event.target.files[0];
        if (!file) return;

        isUploadingLogo = true;
        try {
            const targetSlug =
                firmaConfig.slug ||
                generarSlugFirma(firmaConfig.nombre) ||
                "firma";
            const res = await optimizeAndUploadLogo(file, { slug: targetSlug });
            firmaConfig.logoUrl = res.url;
        } catch (error) {
            console.error("Error al procesar logo:", error);
            alert("Ocurrió un error al procesar la imagen del logo.");
        } finally {
            isUploadingLogo = false;
        }
    }

    async function handleUploadLogoPerfil(event) {
        const file = event.target.files[0];
        if (!file) return;

        isUploadingLogoPerfil = true;
        try {
            const res = await optimizeAndUploadLogo(file, {
                slug: "casa-legal",
            });
            await empresaStore.guardarConfiguracion({
                ...$empresaStore,
                logoUrl: res.url,
            });
            alert(
                "¡Logotipo oficial de Casa Legal actualizado y aplicado como icono de la App!",
            );
        } catch (error) {
            console.error("Error al subir logo perfil:", error);
            alert("Ocurrió un error al procesar el logo de la firma.");
        } finally {
            isUploadingLogoPerfil = false;
        }
    }

    async function handleSaveFirmaConfig() {
        isSavingFirma = true;
        try {
            if (!adminData.password) {
                generarPasswordSegura();
            }
            if (!firmaConfig.slug) {
                firmaConfig.slug = generarSlugFirma(firmaConfig.nombre);
            }

            const res = await empresaStore.crearFirmaDuplicada(
                firmaConfig,
                adminData,
            );
            directAdminLink = res.url;
            savedFirmaMsg = `¡Firma duplicada creada con éxito en ${res.url}! El cliente tendrá su sistema limpio desde 0.`;
            cargarFirmasDuplicadas();
            setTimeout(() => (savedFirmaMsg = ""), 5000);
        } catch (err) {
            console.error(err);
            alert(
                "Error al aplicar personalización: " +
                    (err.message || "Intente de nuevo."),
            );
        } finally {
            isSavingFirma = false;
        }
    }

    async function handleEliminarFirma(slug) {
        if (
            confirm(
                `¿Estás seguro de eliminar el portal de la firma "/${slug}"? Esta acción borrará su acceso.`,
            )
        ) {
            await empresaStore.eliminarFirmaDuplicada(slug);
            cargarFirmasDuplicadas();
        }
    }

    function seleccionarPreset(preset) {
        firmaConfig.nombre = preset.nombre;
        firmaConfig.slug = generarSlugFirma(preset.nombre);
        firmaConfig.subtitulo = preset.subtitulo;
        firmaConfig.eslogan = preset.eslogan;
        firmaConfig.colorPrimario = preset.colorPrimario;
        firmaConfig.colorSecundario = preset.colorSecundario;
        firmaConfig.colorFondo = preset.colorFondo;
        firmaConfig.colorSidebar = preset.colorSidebar;
        firmaConfig.moneda = preset.moneda;

        const firmaWord = (preset.nombre || "Lex")
            .replace(/[^a-zA-Z]/g, "")
            .toLowerCase()
            .slice(0, 8);
        adminData.email = `admin@${firmaConfig.slug}.bo`;
        generarPasswordSegura();
        const origin =
            typeof window !== "undefined" ? window.location.origin : "";
        directAdminLink = `${origin}/${firmaConfig.slug}`;

        savedFirmaMsg = `Preset "${preset.nombre}" seleccionado. Enlace listo: /${firmaConfig.slug}`;
        setTimeout(() => (savedFirmaMsg = ""), 3000);
    }

    function handleImportarJSON(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target.result;
            const res = await empresaStore.importarConfiguracionJSON(content);
            if (res.success) {
                alert("¡Configuración de firma importada correctamente!");
            } else {
                alert(`Error al importar configuración: ${res.error}`);
            }
        };
        reader.readAsText(file);
    }

    async function handleGenerateReport() {
        isGeneratingPdf = true;
        try {
            await generarInformeGeneral();
        } catch (e) {
            alert("Error al generar el informe.");
        } finally {
            isGeneratingPdf = false;
        }
    }
</script>

<div class="p-4 md:p-lg max-w-[1200px] mx-auto w-full space-y-lg pb-24">
    <!-- Header General -->
    <div
        class="flex flex-col md:flex-row justify-between items-start md:items-end gap-4"
    >
        <div>
            <div class="flex items-center gap-2">
                <h2 class="text-headline-xl font-headline-xl text-on-surface">
                    Configuración y Administración
                </h2>
                <span
                    class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#006a39]/10 text-[#006a39] border border-[#006a39]/20"
                >
                    SaaS White-Label
                </span>
            </div>
            <p class="text-body-lg text-on-surface-variant mt-xs">
                Personaliza tu perfil o clona y duplica la plataforma con tu
                marca para revenderla.
            </p>
        </div>

        {#if isAdministrador}
            <div class="flex items-center gap-2">
                <a
                    href="/presentacion"
                    class="px-4 py-2 rounded-xl font-bold bg-[#0c1a14] text-[#ffe08e] hover:bg-[#11231a] border border-[#c5a059] flex items-center gap-2 shadow-md transition-all text-label-md"
                >
                    <span class="material-symbols-outlined text-[18px]"
                        >co_present</span
                    >
                    <span>Modo Jefe</span>
                </a>
            </div>
        {/if}
    </div>

    <!-- TABS DE NAVEGACIÓN DE SETTINGS -->
    <div
        class="flex border-b border-outline-variant gap-4 bg-surface-container-high/40 p-1.5 rounded-2xl"
    >
        <button
            type="button"
            onclick={() => (activeSettingsTab = "perfil")}
            class="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-label-md transition-all {activeSettingsTab ===
            'perfil'
                ? 'bg-white text-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'}"
        >
            <span class="material-symbols-outlined text-[18px]"
                >account_circle</span
            >
            Mi Perfil
        </button>

        {#if !getActiveTenantId() && isAdministrador}
            <button
                type="button"
                onclick={() => (activeSettingsTab = "duplicar")}
                class="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-label-md transition-all {activeSettingsTab ===
                'duplicar'
                    ? 'bg-[#006a39] text-[#ffe08e] shadow-md'
                    : 'text-on-surface-variant hover:text-on-surface'}"
            >
                <span class="material-symbols-outlined text-[18px]"
                    >content_copy</span
                >
                Duplicar App (Marca Blanca)
            </button>
        {/if}

        {#if isAdministrador}
            <button
                type="button"
                onclick={() => (activeSettingsTab = "presentacion")}
                class="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-label-md transition-all {activeSettingsTab ===
                'presentacion'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'}"
            >
                <span class="material-symbols-outlined text-[18px]">slideshow</span>
                Presentación (Modo Jefe)
            </button>
        {/if}
    </div>

    <!-- ======================================================== -->
    <!-- TAB 1: MI PERFIL -->
    <!-- ======================================================== -->
    {#if activeSettingsTab === "perfil"}
        <div class="max-w-[800px]">
            {#if saved}
                <div
                    class="bg-primary/10 border border-primary text-primary px-md py-sm rounded-lg mb-lg flex items-center gap-sm font-label-md"
                >
                    <span class="material-symbols-outlined">check_circle</span>
                    ¡Cambios guardados correctamente!
                </div>
            {/if}

            <div class="glass-card rounded-2xl overflow-hidden shadow-sm">
                <form
                    onsubmit={(e) => {
                        e.preventDefault();
                        saveSettings();
                    }}
                    class="p-xl space-y-lg"
                >
                    <!-- Photo Section -->
                    <div
                        class="flex items-center gap-lg pb-lg border-b border-outline-variant"
                    >
                        <div class="relative group">
                            <img
                                src={formData.photoURL}
                                alt="Foto de Perfil"
                                class="w-24 h-24 rounded-full object-cover border-4 border-surface-container-highest shadow-sm transition-all group-hover:opacity-50"
                            />
                            {#if isUploading}
                                <div
                                    class="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full"
                                >
                                    <span
                                        class="material-symbols-outlined animate-spin text-white"
                                        >progress_activity</span
                                    >
                                </div>
                            {/if}
                        </div>
                        <div>
                            <label
                                for="fotoPerfilInput"
                                class="block text-label-sm text-on-surface-variant font-bold mb-xs uppercase"
                                >Actualizar Foto (Subir desde dispositivo)</label
                            >
                            <input
                                id="fotoPerfilInput"
                                type="file"
                                accept="image/*"
                                onchange={handleFileSelected}
                                class="block w-full text-sm text-on-surface-variant file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition-all cursor-pointer"
                            />
                            <p class="text-[11px] text-outline mt-1">
                                Recomendado: Imagen cuadrada (JPG o PNG)
                            </p>
                        </div>
                    </div>

                    {#if isAdministrador}
                        <div
                            class="p-4 bg-surface-container-low rounded-2xl border border-outline-variant space-y-2"
                        >
                            <label
                                class="block text-label-sm text-on-surface font-bold uppercase flex items-center justify-between"
                            >
                                <span
                                    >Logotipo Oficial de la Firma (Web y App
                                    Móvil)</span
                                >
                                <span class="text-[10px] text-primary font-bold"
                                    >Icono Oficial PWA</span
                                >
                            </label>
                            <div class="flex items-center gap-4">
                                <div
                                    class="w-16 h-16 bg-white rounded-xl border border-outline-variant flex items-center justify-center p-1.5 shadow-xs shrink-0 overflow-hidden"
                                >
                                    {#if $empresaStore?.logoUrl}
                                        <img
                                            src={$empresaStore.logoUrl}
                                            alt="Logo Firma"
                                            class="w-full h-full object-contain"
                                        />
                                    {:else}
                                        <span
                                            class="material-symbols-outlined text-outline text-[28px]"
                                            >business</span
                                        >
                                    {/if}
                                </div>
                                <div class="flex-1 space-y-1.5">
                                    <input
                                        bind:this={perfilLogoInput}
                                        type="file"
                                        accept="image/*"
                                        onchange={handleUploadLogoPerfil}
                                        class="hidden"
                                    />
                                    <button
                                        type="button"
                                        onclick={() => perfilLogoInput.click()}
                                        disabled={isUploadingLogoPerfil}
                                        class="px-4 py-2 rounded-xl bg-surface-container-highest font-bold text-label-sm text-on-surface hover:bg-surface-variant transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                                    >
                                        <span
                                            class="material-symbols-outlined text-[18px]"
                                            >upload</span
                                        >
                                        {isUploadingLogoPerfil
                                            ? "Optimizando Logo..."
                                            : "Subir Logo de la Firma"}
                                    </button>
                                    <p class="text-[11px] text-outline">
                                        Se aplicará como icono en la barra
                                        lateral, recibos, reportes y como icono
                                        de la App Web en dispositivos móviles.
                                    </p>
                                </div>
                            </div>
                        </div>
                    {/if}

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-lg">
                        <div class="space-y-xs">
                            <label
                                for="nombreCompletoInput"
                                class="block text-label-sm text-on-surface-variant font-bold uppercase"
                                >Nombre Completo</label
                            >
                            <input
                                id="nombreCompletoInput"
                                type="text"
                                bind:value={formData.name}
                                placeholder="Ej. Dr. Alejandro Silva"
                                required
                                class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div class="space-y-xs">
                            <label
                                for="cargoTituloInput"
                                class="block text-label-sm text-on-surface-variant font-bold uppercase"
                                >Cargo / Título</label
                            >
                            <input
                                id="cargoTituloInput"
                                type="text"
                                bind:value={formData.title}
                                placeholder="Ej. Socio Director"
                                class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div class="space-y-xs">
                            <label
                                for="emailNotifInput"
                                class="block text-label-sm text-on-surface-variant font-bold uppercase flex items-center justify-between"
                            >
                                <span
                                    >Correo Electrónico (Gmail de
                                    Notificaciones) *</span
                                >
                                <span class="text-[10px] text-primary font-bold"
                                    >Push & Gmail</span
                                >
                            </label>
                            <input
                                id="emailNotifInput"
                                type="email"
                                bind:value={formData.email}
                                placeholder="tu-correo@gmail.com"
                                required
                                class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20"
                            />
                            <p class="text-[11px] text-outline mt-0.5">
                                Aquí recibirás todas las alertas push a tu
                                Gmail: avisos de nuevos ingresos en bóveda,
                                audiencias y mensajes confidenciales.
                            </p>
                        </div>
                        <div class="space-y-xs">
                            <label
                                for="telefonoInput"
                                class="block text-label-sm text-on-surface-variant font-bold uppercase"
                                >Teléfono</label
                            >
                            <input
                                id="telefonoInput"
                                type="tel"
                                bind:value={formData.phone}
                                placeholder="+591 70000000"
                                class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>

                    <!-- AI Guide Selection -->
                    <div class="pt-lg border-t border-outline-variant">
                        <label
                            class="block text-label-sm text-on-surface-variant font-bold mb-md uppercase"
                            >Guía Legal IA Asignado</label
                        >
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
                            <button
                                type="button"
                                onclick={() => (formData.guide = "Zeus")}
                                class="flex items-center p-md border-2 rounded-xl transition-all {formData.guide ===
                                'Zeus'
                                    ? 'border-[#f59e0b] bg-[#f59e0b]/10'
                                    : 'border-outline-variant hover:border-outline'}"
                            >
                                <div class="flex-1 text-left">
                                    <h4
                                        class="font-bold text-headline-md text-[#d97706] mb-xs"
                                    >
                                        Zeus
                                    </h4>
                                    <p
                                        class="text-label-sm text-on-surface-variant"
                                    >
                                        Autoridad y visión estratégica para
                                        litigios complejos.
                                    </p>
                                </div>
                                {#if formData.guide === "Zeus"}
                                    <span
                                        class="material-symbols-outlined text-[#f59e0b]"
                                        >check_circle</span
                                    >
                                {/if}
                            </button>
                            <button
                                type="button"
                                onclick={() => (formData.guide = "Freya")}
                                class="flex items-center p-md border-2 rounded-xl transition-all {formData.guide ===
                                'Freya'
                                    ? 'border-[#a855f7] bg-[#a855f7]/10'
                                    : 'border-outline-variant hover:border-outline'}"
                            >
                                <div class="flex-1 text-left">
                                    <h4
                                        class="font-bold text-headline-md text-[#7e22ce] mb-xs"
                                    >
                                        Freya
                                    </h4>
                                    <p
                                        class="text-label-sm text-on-surface-variant"
                                    >
                                        Mediación detallista y análisis de
                                        contratos.
                                    </p>
                                </div>
                                {#if formData.guide === "Freya"}
                                    <span
                                        class="material-symbols-outlined text-[#a855f7]"
                                        >check_circle</span
                                    >
                                {/if}
                            </button>
                        </div>
                    </div>

                    {#if isAdministrador}
                        <div class="pt-lg border-t border-outline-variant">
                            <label
                                class="block text-label-sm text-on-surface-variant font-bold mb-md uppercase"
                                >Opciones de Administrador General</label
                            >
                            <div
                                class="bg-primary/5 border border-primary/20 rounded-xl p-md flex flex-col sm:flex-row justify-between items-center gap-4"
                            >
                                <div>
                                    <h4
                                        class="font-bold text-body-lg text-on-surface"
                                    >
                                        Generar Informe General
                                    </h4>
                                    <p
                                        class="text-label-sm text-on-surface-variant"
                                    >
                                        Descarga un PDF con el consolidado de
                                        clientes, trámites y resumen financiero.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onclick={handleGenerateReport}
                                    disabled={isGeneratingPdf}
                                    class="px-md py-2 rounded-lg font-bold bg-secondary text-on-secondary hover:bg-secondary-fixed transition-colors flex items-center gap-2 shrink-0"
                                >
                                    {#if isGeneratingPdf}
                                        <span
                                            class="material-symbols-outlined animate-spin text-[18px]"
                                            >progress_activity</span
                                        > Generando...
                                    {:else}
                                        <span
                                            class="material-symbols-outlined text-[18px]"
                                            >picture_as_pdf</span
                                        > Descargar Informe
                                    {/if}
                                </button>
                            </div>
                        </div>
                    {/if}

                    <div class="pt-xl flex justify-end gap-md">
                        <button
                            type="button"
                            onclick={() => goto("/dashboard")}
                            class="px-lg py-sm rounded-lg font-bold text-on-surface-variant hover:bg-surface-container transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            class="px-lg py-sm rounded-lg font-bold bg-primary text-on-primary shadow-md shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-xs"
                        >
                            {#if isSaving}
                                <span
                                    class="material-symbols-outlined animate-spin text-[18px]"
                                    >progress_activity</span
                                >
                            {:else}
                                <span
                                    class="material-symbols-outlined text-[18px]"
                                    >save</span
                                >
                            {/if}
                            Guardar Cambios
                        </button>
                    </div>
                </form>
            </div>

            {#if !getActiveTenantId() && isAdministrador}
                <div class="glass-card rounded-2xl overflow-hidden shadow-sm mt-6 p-6 border border-primary/20 bg-primary/5">
                    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <h3 class="text-title-md font-bold text-on-surface flex items-center gap-2">
                                <span class="material-symbols-outlined text-primary">verified</span>
                                Sistema Maestro: CASA LEGAL
                            </h3>
                            <p class="text-body-sm text-on-surface-variant mt-1">
                                Si durante las pruebas de duplicación se modificó el nombre o estilo de Casa Legal, puedes restablecerlo a sus valores originales con un clic.
                            </p>
                            {#if restoreMasterMsg}
                                <p class="text-sm font-bold text-primary mt-2 flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[16px]">check_circle</span>
                                    {restoreMasterMsg}
                                </p>
                            {/if}
                        </div>
                        <button
                            type="button"
                            onclick={handleRestablecerCasaLegal}
                            disabled={isRestoringMaster}
                            class="px-4 py-2.5 rounded-xl font-bold bg-primary text-on-primary hover:bg-primary/90 transition-all flex items-center gap-2 shadow-sm shrink-0 cursor-pointer text-label-md"
                        >
                            {#if isRestoringMaster}
                                <span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                            {:else}
                                <span class="material-symbols-outlined text-[18px]">restart_alt</span>
                            {/if}
                            Restablecer Casa Legal
                        </button>
                    </div>
                </div>
            {/if}
        </div>

        <!-- ======================================================== -->
        <!-- TAB 2: DUPLICAR APP / MARCA BLANCA PARA OTRAS FIRMAS -->
        <!-- ======================================================== -->
    {:else if activeSettingsTab === "duplicar" && !getActiveTenantId() && isAdministrador}
        <div class="space-y-xl">
            {#if savedFirmaMsg}
                <div
                    class="bg-emerald-50 border border-emerald-400 text-emerald-900 px-4 py-3 rounded-xl flex items-center gap-3 shadow-md animate-bounce"
                >
                    <span
                        class="material-symbols-outlined text-emerald-600 text-[24px]"
                        >verified</span
                    >
                    <span class="font-bold">{savedFirmaMsg}</span>
                </div>
            {/if}

            <!-- 1. Presets de Prestigio -->
            <div
                class="bg-white rounded-2xl border border-outline-variant p-lg shadow-sm"
            >
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h3 class="font-bold text-headline-md text-on-surface">
                            1. Presets de Marca Listos para Demostración y Venta
                        </h3>
                        <p class="text-label-sm text-on-surface-variant">
                            Selecciona una plantilla para clonar al instante la
                            identidad para un cliente específico.
                        </p>
                    </div>
                </div>

                <div
                    class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
                >
                    {#each PRESETS_FIRMAS as preset}
                        <button
                            type="button"
                            onclick={() => seleccionarPreset(preset)}
                            class="p-4 rounded-xl border-2 transition-all text-left flex flex-col justify-between hover:scale-102 hover:shadow-md cursor-pointer {firmaConfig.nombre ===
                            preset.nombre
                                ? 'border-[#006a39] bg-[#006a39]/5 shadow-sm'
                                : 'border-outline-variant bg-surface-container-lowest'}"
                        >
                            <div>
                                <!-- Paleta visual en círculos -->
                                <div class="flex items-center gap-1.5 mb-3">
                                    <span
                                        class="w-5 h-5 rounded-full border border-black/10 shadow-xs"
                                        style="background-color: {preset.colorPrimario}"
                                    ></span>
                                    <span
                                        class="w-4 h-4 rounded-full border border-black/10 shadow-xs"
                                        style="background-color: {preset.colorSecundario}"
                                    ></span>
                                    <span
                                        class="w-3.5 h-3.5 rounded-full border border-black/10 shadow-xs"
                                        style="background-color: {preset.colorSidebar}"
                                    ></span>
                                </div>
                                <h4
                                    class="font-bold text-sm text-on-surface leading-tight mb-1"
                                >
                                    {preset.nombre}
                                </h4>
                                <p
                                    class="text-[11px] text-on-surface-variant line-clamp-2"
                                >
                                    {preset.subtitulo}
                                </p>
                            </div>
                            <div
                                class="mt-4 pt-2 border-t border-outline-variant/40 flex justify-between items-center text-[11px] font-bold"
                            >
                                <span class="text-primary font-mono"
                                    >{preset.moneda}</span
                                >
                                {#if firmaConfig.nombre === preset.nombre}
                                    <span
                                        class="text-emerald-700 flex items-center gap-1"
                                    >
                                        <span
                                            class="material-symbols-outlined text-[14px]"
                                            >check</span
                                        > Activo
                                    </span>
                                {:else}
                                    <span class="text-outline">Aplicar</span>
                                {/if}
                            </div>
                        </button>
                    {/each}
                </div>
            </div>

            <!-- 2. Personalización Detallada y Live Preview Split -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-xl items-start">
                <!-- Columna Izquierda: Formulario de Personalización (7 cols) -->
                <div
                    class="lg:col-span-7 bg-white rounded-2xl border border-outline-variant p-lg shadow-sm space-y-lg"
                >
                    <div>
                        <h3 class="font-bold text-headline-md text-on-surface">
                            2. Personalización de Marca y Colores
                        </h3>
                        <p class="text-label-sm text-on-surface-variant">
                            Personaliza cada detalle para entregar la aplicación
                            llave en mano.
                        </p>
                    </div>

                    <!-- Logo y Paleta de Colores -->
                    <div
                        class="p-4 bg-surface-container-low rounded-xl border border-outline-variant space-y-4"
                    >
                        <label
                            class="block text-label-sm font-bold text-on-surface uppercase"
                            >Logotipo de la Firma</label
                        >
                        <div class="flex items-center gap-4">
                            <div
                                class="w-20 h-20 bg-white rounded-xl border border-outline-variant flex items-center justify-center p-2 shadow-xs shrink-0 overflow-hidden"
                            >
                                {#if firmaConfig.logoUrl}
                                    <img
                                        src={firmaConfig.logoUrl}
                                        alt="Logo Firma"
                                        class="w-full h-full object-contain"
                                    />
                                {:else}
                                    <span
                                        class="material-symbols-outlined text-outline text-[32px]"
                                        >business</span
                                    >
                                {/if}
                            </div>
                            <div class="flex-1 space-y-2">
                                <input
                                    bind:this={logoFileInput}
                                    type="file"
                                    accept="image/*"
                                    onchange={handleUploadLogo}
                                    class="hidden"
                                />
                                <button
                                    type="button"
                                    onclick={() => logoFileInput.click()}
                                    disabled={isUploadingLogo}
                                    class="px-4 py-2 rounded-lg bg-surface-container-highest font-bold text-label-sm text-on-surface hover:bg-surface-variant transition-colors flex items-center gap-1.5"
                                >
                                    <span
                                        class="material-symbols-outlined text-[18px]"
                                        >upload</span
                                    >
                                    {isUploadingLogo
                                        ? "Subiendo Logo..."
                                        : "Subir Nuevo Logo"}
                                </button>
                                <input
                                    type="text"
                                    bind:value={firmaConfig.logoUrl}
                                    placeholder="O pega URL directa de imagen (.png, .webp, .svg)"
                                    class="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-body-sm outline-none focus:border-primary"
                                />
                            </div>
                        </div>

                        <!-- Paleta de 4 Colores -->
                        <div class="pt-3 border-t border-outline-variant/60">
                            <label
                                class="block text-label-sm font-bold text-on-surface uppercase mb-2"
                                >Paleta de Colores Corporativos</label
                            >
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                    <span
                                        class="text-[10px] uppercase font-bold text-outline block mb-1"
                                        >Primario</span
                                    >
                                    <div class="flex items-center gap-2">
                                        <input
                                            type="color"
                                            bind:value={
                                                firmaConfig.colorPrimario
                                            }
                                            class="w-8 h-8 rounded border border-outline-variant cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            bind:value={
                                                firmaConfig.colorPrimario
                                            }
                                            class="w-full text-xs font-mono uppercase bg-white border border-outline-variant rounded p-1"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <span
                                        class="text-[10px] uppercase font-bold text-outline block mb-1"
                                        >Secundario (Oro)</span
                                    >
                                    <div class="flex items-center gap-2">
                                        <input
                                            type="color"
                                            bind:value={
                                                firmaConfig.colorSecundario
                                            }
                                            class="w-8 h-8 rounded border border-outline-variant cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            bind:value={
                                                firmaConfig.colorSecundario
                                            }
                                            class="w-full text-xs font-mono uppercase bg-white border border-outline-variant rounded p-1"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <span
                                        class="text-[10px] uppercase font-bold text-outline block mb-1"
                                        >Fondo App</span
                                    >
                                    <div class="flex items-center gap-2">
                                        <input
                                            type="color"
                                            bind:value={firmaConfig.colorFondo}
                                            class="w-8 h-8 rounded border border-outline-variant cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            bind:value={firmaConfig.colorFondo}
                                            class="w-full text-xs font-mono uppercase bg-white border border-outline-variant rounded p-1"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <span
                                        class="text-[10px] uppercase font-bold text-outline block mb-1"
                                        >Sidebar</span
                                    >
                                    <div class="flex items-center gap-2">
                                        <input
                                            type="color"
                                            bind:value={
                                                firmaConfig.colorSidebar
                                            }
                                            class="w-8 h-8 rounded border border-outline-variant cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            bind:value={
                                                firmaConfig.colorSidebar
                                            }
                                            class="w-full text-xs font-mono uppercase bg-white border border-outline-variant rounded p-1"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Datos Institucionales -->
                    <div class="space-y-md">
                        <div>
                            <label
                                for="slugFirmaInput"
                                class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                >Enlace URL Exclusivo del Sistema (Multi-Tenant)</label
                            >
                            <div
                                class="flex items-center gap-1 font-mono text-sm"
                            >
                                <span
                                    class="bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-on-surface-variant font-bold text-xs shrink-0"
                                >
                                    dominio.com/
                                </span>
                                <input
                                    id="slugFirmaInput"
                                    type="text"
                                    bind:value={firmaConfig.slug}
                                    oninput={(e) => {
                                        firmaConfig.slug = e.target.value
                                            .toLowerCase()
                                            .replace(/[^a-z0-9-]/g, "-");
                                    }}
                                    placeholder="laempresajuridica"
                                    class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md font-mono font-bold text-primary focus:border-primary outline-none"
                                />
                            </div>
                            <p class="text-[11px] text-outline mt-1">
                                Ruta directa del portal del cliente. Su base de
                                datos (clientes, casos, bóveda) iniciará limpia
                                desde 0.
                            </p>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-md">
                            <div>
                                <label
                                    for="nombreFirmaInput"
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >Nombre de la Firma / Bufete</label
                                >
                                <input
                                    id="nombreFirmaInput"
                                    type="text"
                                    bind:value={firmaConfig.nombre}
                                    oninput={() => {
                                        if (
                                            !firmaConfig.slug ||
                                            firmaConfig.slug ===
                                                generarSlugFirma(
                                                    firmaConfig.nombre.slice(
                                                        0,
                                                        -1,
                                                    ),
                                                )
                                        ) {
                                            firmaConfig.slug = generarSlugFirma(
                                                firmaConfig.nombre,
                                            );
                                        }
                                    }}
                                    class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md font-bold focus:border-primary outline-none"
                                />
                            </div>
                            <div>
                                <label
                                    for="monedaInput"
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >Símbolo de Moneda</label
                                >
                                <input
                                    id="monedaInput"
                                    type="text"
                                    bind:value={firmaConfig.moneda}
                                    placeholder="Bs., $, USD, EUR..."
                                    class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md font-mono font-bold focus:border-primary outline-none"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-md">
                            <div>
                                <label
                                    for="subtituloFirmaInput"
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >Subtítulo / Especialidad</label
                                >
                                <input
                                    id="subtituloFirmaInput"
                                    type="text"
                                    bind:value={firmaConfig.subtitulo}
                                    class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md focus:border-primary outline-none"
                                />
                            </div>
                            <div>
                                <label
                                    for="esloganInput"
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >Eslogan de la Marca</label
                                >
                                <input
                                    id="esloganInput"
                                    type="text"
                                    bind:value={firmaConfig.eslogan}
                                    class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md focus:border-primary outline-none"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-md">
                            <div>
                                <label
                                    for="telefonoCorpInput"
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >Teléfono Corporativo</label
                                >
                                <input
                                    id="telefonoCorpInput"
                                    type="text"
                                    bind:value={firmaConfig.telefono}
                                    class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md focus:border-primary outline-none"
                                />
                            </div>
                            <div>
                                <label
                                    for="emailCorpInput"
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >Email Institucional</label
                                >
                                <input
                                    id="emailCorpInput"
                                    type="email"
                                    bind:value={firmaConfig.email}
                                    class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md focus:border-primary outline-none"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-md">
                            <div>
                                <label
                                    for="direccionCorpInput"
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >Dirección Física</label
                                >
                                <input
                                    id="direccionCorpInput"
                                    type="text"
                                    bind:value={firmaConfig.direccion}
                                    class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md focus:border-primary outline-none"
                                />
                            </div>
                            <div>
                                <label
                                    for="ciudadCorpInput"
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >Ciudad / País</label
                                >
                                <input
                                    id="ciudadCorpInput"
                                    type="text"
                                    bind:value={firmaConfig.ciudad}
                                    class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md focus:border-primary outline-none"
                                />
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-md">
                            <div>
                                <label
                                    for="nitCorpInput"
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >NIT / RUC / Identificación Fiscal</label
                                >
                                <input
                                    id="nitCorpInput"
                                    type="text"
                                    bind:value={firmaConfig.nit}
                                    class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md focus:border-primary outline-none"
                                />
                            </div>
                            <div>
                                <label
                                    for="registroCorpInput"
                                    class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                    >Registro Oficial Notarial / Judicial</label
                                >
                                <input
                                    id="registroCorpInput"
                                    type="text"
                                    bind:value={firmaConfig.registroNotarial}
                                    class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md focus:border-primary outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label
                                for="piePaginaCorpInput"
                                class="block text-label-sm font-bold text-on-surface-variant uppercase mb-xs"
                                >Leyenda de Pie de Página en Reportes y Facturas</label
                            >
                            <input
                                id="piePaginaCorpInput"
                                type="text"
                                bind:value={firmaConfig.piePagina}
                                class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-2.5 text-body-md focus:border-primary outline-none"
                            />
                        </div>
                    </div>

                    <!-- 3. Credenciales del Administrador General de la Firma -->
                    <div
                        class="p-5 bg-surface-container-low rounded-xl border border-primary/30 space-y-4 ring-1 ring-primary/20"
                    >
                        <div class="flex items-center justify-between">
                            <span
                                class="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5"
                            >
                                <span
                                    class="material-symbols-outlined text-[18px]"
                                    >admin_panel_settings</span
                                >
                                3. Cuenta del Administrador General (Dueño de la
                                Firma)
                            </span>
                            <span
                                class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold"
                            >
                                Control Total
                            </span>
                        </div>
                        <p class="text-xs text-on-surface-variant">
                            Credenciales con las que el comprador gestionará el
                            sistema, agregará a sus propios abogados en <strong
                                >Equipo Legal</strong
                            > e instalará la Web App con su logo.
                        </p>

                        <div
                            class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
                        >
                            <div>
                                <label
                                    class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1"
                                    >Nombre Completo</label
                                >
                                <input
                                    type="text"
                                    bind:value={adminData.nombre}
                                    class="w-full bg-white border border-outline-variant rounded-xl p-2 font-bold outline-none focus:border-primary"
                                    placeholder="Dr. Roberto Mendoza"
                                />
                            </div>
                            <div>
                                <label
                                    class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1"
                                    >Cargo / Especialidad</label
                                >
                                <input
                                    type="text"
                                    bind:value={adminData.cargo}
                                    class="w-full bg-white border border-outline-variant rounded-xl p-2 outline-none focus:border-primary"
                                    placeholder="Socio Director General"
                                />
                            </div>
                            <div>
                                <label
                                    class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1"
                                    >Usuario / Email de Acceso</label
                                >
                                <input
                                    type="email"
                                    bind:value={adminData.email}
                                    class="w-full bg-white border border-outline-variant rounded-xl p-2 font-mono font-bold text-primary outline-none focus:border-primary"
                                    placeholder="admin@firma.bo"
                                />
                            </div>
                            <div>
                                <label
                                    class="block text-[11px] font-bold text-on-surface-variant uppercase mb-1"
                                    >Teléfono / WhatsApp</label
                                >
                                <input
                                    type="text"
                                    bind:value={adminData.telefono}
                                    class="w-full bg-white border border-outline-variant rounded-xl p-2 font-mono outline-none focus:border-primary"
                                    placeholder="+591 71234567"
                                />
                            </div>
                            <div class="sm:col-span-2">
                                <div
                                    class="flex items-center justify-between mb-1"
                                >
                                    <label
                                        class="block text-[11px] font-bold text-on-surface-variant uppercase"
                                        >Contraseña Maestra Generada</label
                                    >
                                    <button
                                        type="button"
                                        onclick={generarPasswordSegura}
                                        class="text-[10px] text-primary hover:underline font-bold flex items-center gap-1"
                                    >
                                        <span
                                            class="material-symbols-outlined text-[13px]"
                                            >autorenew</span
                                        >
                                        Regenerar Contraseña Segura
                                    </button>
                                </div>
                                <div class="flex items-center gap-2">
                                    <div class="relative flex-1">
                                        {#if showPassword}
                                            <input
                                                type="text"
                                                bind:value={adminData.password}
                                                class="w-full bg-white border border-outline-variant rounded-xl p-2 pr-10 font-mono font-bold tracking-wider text-emerald-800 outline-none"
                                            />
                                        {:else}
                                            <input
                                                type="password"
                                                bind:value={adminData.password}
                                                class="w-full bg-white border border-outline-variant rounded-xl p-2 pr-10 font-mono font-bold tracking-wider text-emerald-800 outline-none"
                                            />
                                        {/if}
                                        <button
                                            type="button"
                                            onclick={() =>
                                                (showPassword = !showPassword)}
                                            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                                        >
                                            <span
                                                class="material-symbols-outlined text-[18px]"
                                                >{showPassword
                                                    ? "visibility_off"
                                                    : "visibility"}</span
                                            >
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onclick={() => {
                                            navigator.clipboard.writeText(
                                                adminData.password,
                                            );
                                            alert(
                                                "Contraseña copiada al portapapeles",
                                            );
                                        }}
                                        class="px-3 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                                    >
                                        <span
                                            class="material-symbols-outlined text-[15px]"
                                            >content_copy</span
                                        >
                                        Copiar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Botón de Guardado y Aplicación -->
                    <div
                        class="pt-4 border-t border-outline-variant flex justify-end"
                    >
                        <button
                            type="button"
                            onclick={handleSaveFirmaConfig}
                            disabled={isSavingFirma}
                            class="px-8 py-3 rounded-xl font-bold bg-[#006a39] text-[#ffe08e] hover:bg-[#004d28] border border-[#c5a059] shadow-lg flex items-center gap-2 text-label-md transition-all disabled:opacity-50"
                        >
                            {#if isSavingFirma}
                                <span
                                    class="material-symbols-outlined animate-spin text-[18px]"
                                    >progress_activity</span
                                >
                                Aplicando Configuración...
                            {:else}
                                <span
                                    class="material-symbols-outlined text-[18px]"
                                    >check_circle</span
                                >
                                Aplicar y Guardar en este Sistema
                            {/if}
                        </button>
                    </div>
                </div>

                <!-- Columna Derecha: Mockup Interactivo en Vivo + Exportación (5 cols) -->
                <div class="lg:col-span-5 space-y-md sticky top-24">
                    <!-- Tarjeta Live Preview -->
                    <div
                        class="bg-white rounded-2xl border border-outline-variant p-5 shadow-lg"
                    >
                        <div class="flex justify-between items-center mb-3">
                            <span
                                class="text-xs uppercase tracking-widest font-bold text-primary flex items-center gap-1.5"
                            >
                                <span
                                    class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"
                                ></span>
                                Vista Previa en Vivo
                            </span>
                            <span class="text-[11px] font-mono text-outline"
                                >Resolución HD</span
                            >
                        </div>

                        <!-- Mockup Miniatura de la App -->
                        <div
                            class="rounded-xl overflow-hidden border border-outline-variant shadow-inner"
                            style="background-color: {firmaConfig.colorFondo}"
                        >
                            <!-- Mini Header -->
                            <div
                                class="h-10 border-b border-black/10 bg-white/90 backdrop-blur-md px-3 flex items-center justify-between"
                            >
                                <div class="flex items-center gap-2">
                                    <div
                                        class="w-5 h-5 rounded-md bg-white border border-black/10 flex items-center justify-center overflow-hidden"
                                    >
                                        {#if firmaConfig.logoUrl}
                                            <img
                                                src={firmaConfig.logoUrl}
                                                alt="logo"
                                                class="w-full h-full object-contain"
                                            />
                                        {:else}
                                            <span
                                                class="material-symbols-outlined text-[12px] text-gray-500"
                                                >balance</span
                                            >
                                        {/if}
                                    </div>
                                    <span
                                        class="font-bold text-xs truncate max-w-[140px]"
                                        style="color: {firmaConfig.colorPrimario}"
                                    >
                                        {firmaConfig.nombre}
                                    </span>
                                </div>
                                <div
                                    class="flex items-center gap-2 text-[10px] text-gray-500"
                                >
                                    <span
                                        class="w-2 h-2 rounded-full bg-emerald-500"
                                    ></span>
                                    <span>En línea</span>
                                </div>
                            </div>

                            <!-- Mini Body -->
                            <div class="p-3 grid grid-cols-2 gap-2">
                                <!-- Mini Card 1 -->
                                <div
                                    class="bg-white p-2.5 rounded-lg border border-black/5 shadow-2xs"
                                >
                                    <span
                                        class="text-[9px] uppercase font-bold text-gray-400 block"
                                        >Recaudación</span
                                    >
                                    <span
                                        class="text-sm font-bold"
                                        style="color: {firmaConfig.colorPrimario}"
                                    >
                                        {firmaConfig.moneda} 48,500
                                    </span>
                                </div>
                                <!-- Mini Card 2 -->
                                <div
                                    class="p-2.5 rounded-lg text-white shadow-2xs"
                                    style="background-color: {firmaConfig.colorPrimario}"
                                >
                                    <span
                                        class="text-[9px] uppercase font-bold text-white/70 block"
                                        >Utilidad Neta</span
                                    >
                                    <span
                                        class="text-sm font-bold"
                                        style="color: {firmaConfig.colorSecundario}"
                                    >
                                        {firmaConfig.moneda} 35,300
                                    </span>
                                </div>
                            </div>

                            <!-- Mini Recibo Comprobante -->
                            <div
                                class="mx-3 mb-3 p-2.5 bg-white rounded-lg border border-dashed border-gray-300 text-[10px]"
                            >
                                <div
                                    class="flex justify-between items-center mb-1"
                                >
                                    <strong class="font-serif"
                                        >{firmaConfig.nombre}</strong
                                    >
                                    <span
                                        class="font-mono text-[9px] text-gray-500"
                                        >REC-0492</span
                                    >
                                </div>
                                <div class="text-gray-500">
                                    {firmaConfig.subtitulo}
                                </div>
                                <div
                                    class="mt-1 pt-1 border-t border-gray-100 flex justify-between font-bold"
                                    style="color: {firmaConfig.colorPrimario}"
                                >
                                    <span>Honorarios Legales</span>
                                    <span>{firmaConfig.moneda} 2,500.00</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Enlace Directo y Credenciales del Comprador -->
                    <div
                        class="bg-surface-container-lowest border-2 border-primary/40 rounded-2xl p-5 shadow-md space-y-3"
                    >
                        <div class="flex items-center justify-between">
                            <span
                                class="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5"
                            >
                                <span
                                    class="material-symbols-outlined text-[18px]"
                                    >link</span
                                >
                                Enlace Directo del Administrador General
                            </span>
                            <span
                                class="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md font-bold"
                            >
                                LISTO PARA EL CLIENTE
                            </span>
                        </div>
                        <p class="text-xs text-on-surface-variant">
                            Envía este link al cliente adquirente para que
                            ingrese directo a la administración con su marca y
                            usuario pre-cargado:
                        </p>

                        <div
                            class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                        >
                            <input
                                type="text"
                                readonly
                                value={directAdminLink}
                                class="flex-1 bg-surface border border-outline-variant rounded-xl py-2 px-3 text-xs font-mono select-all text-on-surface outline-none"
                            />
                            <button
                                type="button"
                                onclick={copiarLinkDirecto}
                                class="px-3 py-2 rounded-xl bg-primary text-on-primary font-bold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0"
                            >
                                <span
                                    class="material-symbols-outlined text-[15px]"
                                >
                                    {linkCopiado ? "done" : "content_copy"}
                                </span>
                                <span
                                    >{linkCopiado
                                        ? "¡Copiado!"
                                        : "Copiar"}</span
                                >
                            </button>
                            <a
                                href={directAdminLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="px-3 py-2 rounded-xl border border-primary text-primary font-bold text-xs hover:bg-primary/5 transition-all flex items-center justify-center gap-1.5 shrink-0"
                            >
                                <span
                                    class="material-symbols-outlined text-[15px]"
                                    >open_in_new</span
                                >
                                Abrir
                            </a>
                        </div>

                        <div
                            class="pt-2 border-t border-outline-variant/60 flex justify-between items-center text-xs"
                        >
                            <span class="text-on-surface-variant font-mono">
                                <strong>Admin:</strong>
                                {adminData.email} | <strong>Clave:</strong>
                                {adminData.password}
                            </span>
                            <button
                                type="button"
                                onclick={copiarCredenciales}
                                class="text-primary hover:underline font-bold text-[11px] flex items-center gap-1 shrink-0 ml-2"
                            >
                                <span
                                    class="material-symbols-outlined text-[14px]"
                                    >{credsCopiadas
                                        ? "done"
                                        : "content_copy"}</span
                                >
                                {credsCopiadas ? "Copiado" : "Copiar Creds"}
                            </button>
                        </div>
                    </div>

                    <!-- 3. Exportación y Clonación de la App -->
                    <div
                        class="bg-[#1a1d1e] text-white p-5 rounded-2xl shadow-xl border border-[#c5a059]/40 space-y-4"
                    >
                        <div class="flex items-center gap-2">
                            <span
                                class="material-symbols-outlined text-[#ffe08e]"
                                >storefront</span
                            >
                            <div>
                                <h4 class="font-bold text-body-md text-white">
                                    Vender a Otras Firmas
                                </h4>
                                <p class="text-[11px] text-gray-400">
                                    Exporta o importa el paquete de clonación
                                    sin tocar código.
                                </p>
                            </div>
                        </div>

                        <div class="space-y-2">
                            <button
                                type="button"
                                onclick={empresaStore.exportarConfiguracionJSON}
                                class="w-full py-2.5 rounded-xl font-bold bg-[#c5a059] text-[#0c1a14] hover:bg-[#ffe08e] transition-colors flex items-center justify-center gap-2 text-label-sm shadow-md"
                            >
                                <span
                                    class="material-symbols-outlined text-[18px]"
                                    >file_download</span
                                >
                                Exportar Paquete de Duplicación (.JSON)
                            </button>

                            <input
                                bind:this={jsonFileInput}
                                type="file"
                                accept=".json"
                                onchange={handleImportarJSON}
                                class="hidden"
                            />
                            <button
                                type="button"
                                onclick={() => jsonFileInput.click()}
                                class="w-full py-2.5 rounded-xl font-bold border border-white/20 text-white hover:bg-white/10 transition-colors flex items-center justify-center gap-2 text-label-sm"
                            >
                                <span
                                    class="material-symbols-outlined text-[18px]"
                                    >file_upload</span
                                >
                                Importar Configuración (.JSON)
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 4. Lista de Portales Duplicados Creados -->
            <div
                class="bg-white rounded-2xl border border-outline-variant p-lg shadow-sm space-y-md"
            >
                <div
                    class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
                >
                    <div>
                        <h3
                            class="font-bold text-headline-md text-on-surface flex items-center gap-2"
                        >
                            <span class="material-symbols-outlined text-primary"
                                >domain</span
                            >
                            Portales de Clientes Duplicados Activos
                        </h3>
                        <p class="text-label-sm text-on-surface-variant">
                            Bufetes creados con su propia URL independiente y
                            base de datos limpia desde 0.
                        </p>
                    </div>
                    <button
                        type="button"
                        onclick={cargarFirmasDuplicadas}
                        class="px-3 py-1.5 rounded-lg border border-outline-variant hover:bg-surface-container text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <span class="material-symbols-outlined text-[16px]"
                            >refresh</span
                        >
                        Actualizar Lista
                    </button>
                </div>

                {#if listaFirmasDuplicadas.length === 0}
                    <div
                        class="p-8 text-center rounded-xl bg-surface-container-lowest border border-dashed border-outline-variant"
                    >
                        <span
                            class="material-symbols-outlined text-outline text-[40px] mb-2"
                            >content_copy</span
                        >
                        <p class="text-sm font-bold text-on-surface">
                            No hay firmas duplicadas creadas todavía
                        </p>
                        <p class="text-xs text-on-surface-variant mt-0.5">
                            Completa el formulario de arriba y haz clic en
                            "Aplicar y Guardar" para generar tu primer portal
                            cliente con su URL propia.
                        </p>
                    </div>
                {:else}
                    <div
                        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    >
                        {#each listaFirmasDuplicadas as firma (firma.id || firma.slug)}
                            <div
                                class="p-4 rounded-xl border border-outline-variant bg-surface-container-lowest flex flex-col justify-between space-y-3 shadow-xs hover:shadow-md transition-shadow"
                            >
                                <div class="flex items-start gap-3">
                                    <div
                                        class="w-12 h-12 rounded-xl bg-white border border-outline-variant p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-xs"
                                    >
                                        {#if firma.logoUrl}
                                            <img
                                                src={firma.logoUrl}
                                                alt={firma.nombre}
                                                class="w-full h-full object-contain"
                                            />
                                        {:else}
                                            <span
                                                class="material-symbols-outlined text-outline text-[24px]"
                                                >business</span
                                            >
                                        {/if}
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <h4
                                            class="font-bold text-sm text-on-surface truncate"
                                        >
                                            {firma.nombre}
                                        </h4>
                                        <p
                                            class="text-[11px] text-on-surface-variant line-clamp-1"
                                        >
                                            {firma.subtitulo ||
                                                "Firma Jurídica"}
                                        </p>
                                        <a
                                            href="/{firma.slug}"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-primary hover:underline mt-1"
                                        >
                                            <span
                                                class="material-symbols-outlined text-[13px]"
                                                >link</span
                                            >
                                            /{firma.slug}
                                        </a>
                                    </div>
                                </div>

                                <div
                                    class="p-2.5 rounded-lg bg-surface border border-outline-variant/60 text-[11px] space-y-1"
                                >
                                    <div
                                        class="flex justify-between items-center"
                                    >
                                        <span class="text-outline">Admin:</span>
                                        <span
                                            class="font-mono font-bold text-on-surface select-all truncate max-w-[170px]"
                                        >
                                            {firma.administradorGeneral
                                                ?.email ||
                                                firma.email ||
                                                "admin@" + firma.slug}
                                        </span>
                                    </div>
                                    <div
                                        class="flex justify-between items-center"
                                    >
                                        <span class="text-outline">Moneda:</span
                                        >
                                        <span
                                            class="font-mono font-bold text-primary"
                                            >{firma.moneda || "Bs."}</span
                                        >
                                    </div>
                                </div>

                                <div
                                    class="pt-2 border-t border-outline-variant/60 flex items-center justify-between gap-1"
                                >
                                    <div class="flex items-center gap-1">
                                        <a
                                            href="/{firma.slug}"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="px-2.5 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold hover:opacity-90 flex items-center gap-1"
                                        >
                                            <span
                                                class="material-symbols-outlined text-[14px]"
                                                >open_in_new</span
                                            >
                                            Abrir
                                        </a>
                                        <button
                                            type="button"
                                            onclick={() => {
                                                const origin =
                                                    typeof window !==
                                                    "undefined"
                                                        ? window.location.origin
                                                        : "";
                                                navigator.clipboard.writeText(
                                                    `${origin}/${firma.slug}`,
                                                );
                                                alert(
                                                    `Enlace copiado: ${origin}/${firma.slug}`,
                                                );
                                            }}
                                            class="px-2.5 py-1.5 rounded-lg border border-outline-variant text-xs font-bold hover:bg-surface transition-colors flex items-center gap-1 cursor-pointer"
                                            title="Copiar enlace del cliente"
                                        >
                                            <span
                                                class="material-symbols-outlined text-[14px]"
                                                >content_copy</span
                                            >
                                            Copiar
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onclick={() =>
                                            handleEliminarFirma(firma.slug)}
                                        class="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                        title="Eliminar esta firma duplicada"
                                    >
                                        <span
                                            class="material-symbols-outlined text-[16px]"
                                            >delete</span
                                        >
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>

        <!-- ======================================================== -->
        <!-- TAB 3: PRESENTACIÓN (MODO JEFE) INFO -->
        <!-- ======================================================== -->
    {:else if activeSettingsTab === "presentacion" && isAdministrador}
        <div
            class="bg-[#0c1a14] border-2 border-[#c5a059] rounded-2xl p-8 text-[#f4f1ea] shadow-2xl space-y-6"
        >
            <div
                class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#c5a059]/30 pb-6"
            >
                <div>
                    <span
                        class="text-xs uppercase font-mono tracking-widest text-[#c5a059] block mb-1"
                        >PROYECCIÓN DE NEGOCIO</span
                    >
                    <h3 class="font-serif text-3xl font-normal text-white">
                        Modo Jefe: Presentación Ejecutiva
                    </h3>
                    <p class="text-sm text-[#eae6dc]/70 font-sans mt-1">
                        Una pantalla completa editorial diseñada para reuniones
                        con socios, inversionistas y directores.
                    </p>
                </div>
                <a
                    href="/presentacion"
                    class="px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-[#c5a059] to-[#ffe08e] text-[#0c1a14] shadow-lg hover:brightness-110 flex items-center gap-2 text-label-md transition-all shrink-0"
                >
                    <span class="material-symbols-outlined text-[20px]"
                        >fullscreen</span
                    >
                    Iniciar Modo Jefe
                </a>
            </div>

            <!-- Resumen de las 5 láminas -->
            <div class="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                <div
                    class="bg-[#11231a] p-4 rounded-xl border border-[#c5a059]/20"
                >
                    <span class="font-mono text-[#c5a059] block mb-1"
                        >LÁMINA 01</span
                    >
                    <strong class="text-white block mb-1"
                        >Resultados del Mes</strong
                    >
                    <p class="text-[#eae6dc]/60">
                        4 tarjetas con ventas, utilidad, tickets y margen con
                        contadores animados.
                    </p>
                </div>
                <div
                    class="bg-[#11231a] p-4 rounded-xl border border-[#c5a059]/20"
                >
                    <span class="font-mono text-[#c5a059] block mb-1"
                        >LÁMINA 02</span
                    >
                    <strong class="text-white block mb-1"
                        >Tendencia y Futuro</strong
                    >
                    <p class="text-[#eae6dc]/60">
                        Gráfica diaria de 60 días + regresión a 21 días con
                        banda de confianza 95%.
                    </p>
                </div>
                <div
                    class="bg-[#11231a] p-4 rounded-xl border border-[#c5a059]/20"
                >
                    <span class="font-mono text-[#c5a059] block mb-1"
                        >LÁMINA 03</span
                    >
                    <strong class="text-white block mb-1"
                        >Lo que dicen los datos</strong
                    >
                    <p class="text-[#eae6dc]/60">
                        6 hallazgos en lenguaje natural: mejor día, alertas y
                        cross-selling.
                    </p>
                </div>
                <div
                    class="bg-[#11231a] p-4 rounded-xl border border-[#c5a059]/20"
                >
                    <span class="font-mono text-[#c5a059] block mb-1"
                        >LÁMINA 04</span
                    >
                    <strong class="text-white block mb-1"
                        >Productos Estrella</strong
                    >
                    <p class="text-[#eae6dc]/60">
                        Barras horizontales de los 6 servicios principales y su
                        % del total.
                    </p>
                </div>
                <div
                    class="bg-[#11231a] p-4 rounded-xl border border-[#c5a059]/20"
                >
                    <span class="font-mono text-[#c5a059] block mb-1"
                        >LÁMINA 05</span
                    >
                    <strong class="text-white block mb-1"
                        >Inventario Bajo Control</strong
                    >
                    <p class="text-[#eae6dc]/60">
                        Monitoreo de suministros y valores forenses con días de
                        cobertura restante.
                    </p>
                </div>
            </div>

            <div
                class="pt-4 border-t border-[#c5a059]/20 flex flex-wrap items-center gap-4 text-xs text-[#eae6dc]/60"
            >
                <span>Atajos de teclado:</span>
                <span
                    class="bg-white/10 px-2 py-0.5 rounded font-mono text-white"
                    >← / → Cambiar lámina</span
                >
                <span
                    class="bg-white/10 px-2 py-0.5 rounded font-mono text-white"
                    >Espacio Pausar / Reanudar</span
                >
                <span
                    class="bg-white/10 px-2 py-0.5 rounded font-mono text-white"
                    >Esc Salir</span
                >
            </div>
        </div>
    {/if}
</div>
