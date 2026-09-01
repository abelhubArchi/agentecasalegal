<script>
    import { authStore } from '$lib/stores/auth.js';
    import { goto } from '$app/navigation';
    import { storage } from '$lib/firebase/client.js';
    import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
    
    let isSaving = false;
    let isUploading = false;
    let saved = false;

    // Local state for the form, pre-filled with current authStore profile
    let formData = {
        name: $authStore.profile?.name || '',
        phone: $authStore.profile?.phone || '',
        title: $authStore.profile?.title || 'Abogado',
        photoURL: $authStore.profile?.photoURL || 'https://www.gravatar.com/avatar/0?d=mp&f=y',
        guide: $authStore.profile?.guide || ''
    };

    async function saveSettings() {
        isSaving = true;
        saved = false;
        try {
            await authStore.updateProfile({
                name: formData.name,
                phone: formData.phone,
                title: formData.title,
                photoURL: formData.photoURL,
                guide: formData.guide
            });
            saved = true;
            setTimeout(() => saved = false, 3000);
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
</script>

<div class="p-lg max-w-[800px] mx-auto w-full space-y-lg">
    <!-- Header -->
    <div class="mb-xl">
        <h2 class="text-headline-xl font-headline-xl text-on-surface">Configuración de Perfil</h2>
        <p class="text-body-lg text-on-surface-variant mt-xs">Personaliza tu información y experiencia en la plataforma.</p>
    </div>

    {#if saved}
        <div class="bg-primary/10 border border-primary text-primary px-md py-sm rounded-lg mb-lg flex items-center gap-sm font-label-md">
            <span class="material-symbols-outlined">check_circle</span>
            ¡Cambios guardados correctamente!
        </div>
    {/if}

    <div class="glass-card rounded-2xl overflow-hidden shadow-sm">
        <form onsubmit={(e) => { e.preventDefault(); saveSettings(); }} class="p-xl space-y-lg">
            
            <!-- Photo Section -->
            <div class="flex items-center gap-lg pb-lg border-b border-outline-variant">
                <div class="relative group">
                    <img src={formData.photoURL} alt="Foto de Perfil" class="w-24 h-24 rounded-full object-cover border-4 border-surface-container-highest shadow-sm transition-all group-hover:opacity-50">
                    {#if isUploading}
                        <div class="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
                            <span class="material-symbols-outlined animate-spin text-white">progress_activity</span>
                        </div>
                    {/if}
                </div>
                <div>
                    <label class="block text-label-sm text-on-surface-variant font-bold mb-xs uppercase">Actualizar Foto (Subir desde dispositivo)</label>
                    <input type="file" accept="image/*" onchange={handleFileSelected} class="block w-full text-sm text-on-surface-variant file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition-all cursor-pointer">
                    <p class="text-[11px] text-outline mt-1">Recomendado: Imagen cuadrada (JPG o PNG)</p>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-lg">
                <div class="space-y-xs">
                    <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Nombre Completo</label>
                    <input type="text" bind:value={formData.name} placeholder="Ej. Dr. Alejandro Silva" required class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                </div>
                <div class="space-y-xs">
                    <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Cargo / Título</label>
                    <input type="text" bind:value={formData.title} placeholder="Ej. Socio Director" class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                </div>
                <div class="space-y-xs">
                    <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Email (Solo lectura)</label>
                    <input type="email" value={$authStore.user?.email || ''} disabled class="w-full bg-surface-container-low border border-outline-variant rounded-lg py-sm px-md text-body-md text-on-surface-variant cursor-not-allowed">
                </div>
                <div class="space-y-xs">
                    <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Teléfono</label>
                    <input type="tel" bind:value={formData.phone} placeholder="+52 123 456 7890" class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                </div>
            </div>

            <!-- AI Guide Selection -->
            <div class="pt-lg border-t border-outline-variant">
                <label class="block text-label-sm text-on-surface-variant font-bold mb-md uppercase">Guía Legal IA Asignado</label>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
                    <button type="button" onclick={() => formData.guide = 'Zeus'} class="flex items-center p-md border-2 rounded-xl transition-all {formData.guide === 'Zeus' ? 'border-[#f59e0b] bg-[#f59e0b]/10' : 'border-outline-variant hover:border-outline'}">
                        <div class="flex-1 text-left">
                            <h4 class="font-bold text-headline-md text-[#d97706] mb-xs">Zeus</h4>
                            <p class="text-label-sm text-on-surface-variant">Autoridad y visión estratégica para litigios complejos.</p>
                        </div>
                        {#if formData.guide === 'Zeus'}
                            <span class="material-symbols-outlined text-[#f59e0b]">check_circle</span>
                        {/if}
                    </button>
                    <button type="button" onclick={() => formData.guide = 'Freya'} class="flex items-center p-md border-2 rounded-xl transition-all {formData.guide === 'Freya' ? 'border-[#a855f7] bg-[#a855f7]/10' : 'border-outline-variant hover:border-outline'}">
                        <div class="flex-1 text-left">
                            <h4 class="font-bold text-headline-md text-[#7e22ce] mb-xs">Freya</h4>
                            <p class="text-label-sm text-on-surface-variant">Mediación detallista y análisis de contratos.</p>
                        </div>
                        {#if formData.guide === 'Freya'}
                            <span class="material-symbols-outlined text-[#a855f7]">check_circle</span>
                        {/if}
                    </button>
                </div>
            </div>

            <div class="pt-xl flex justify-end gap-md">
                <button type="button" onclick={() => goto('/dashboard')} class="px-lg py-sm rounded-lg font-bold text-on-surface-variant hover:bg-surface-container transition-all">
                    Cancelar
                </button>
                <button type="submit" disabled={isSaving} class="px-lg py-sm rounded-lg font-bold bg-primary text-on-primary shadow-md shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-xs">
                    {#if isSaving}
                        <span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    {:else}
                        <span class="material-symbols-outlined text-[18px]">save</span>
                    {/if}
                    Guardar Cambios
                </button>
            </div>
        </form>
    </div>
</div>
