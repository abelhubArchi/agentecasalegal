<script>
    import { onMount, onDestroy } from 'svelte';
    import { subscribeToEmpleados, addEmpleado, deleteEmpleado } from '$lib/firebase/empleados.js';
    import { secondaryAuth, createUserWithEmailAndPassword, signOut } from '$lib/firebase/client.js';

    let empleados = $state([]);
    let unsubscribe = null;
    let loading = $state(true);
    let showModal = $state(false);
    let isSubmitting = $state(false);
    
    let formData = $state({
        nombre: '',
        apellidos: '',
        rol: 'Abogado',
        telefono: '',
        password: ''
    });

    onMount(() => {
        unsubscribe = subscribeToEmpleados((data) => {
            empleados = data;
            loading = false;
        });
    });

    onDestroy(() => {
        if (unsubscribe) unsubscribe();
    });

    async function handleSubmit(e) {
        e.preventDefault();
        isSubmitting = true;
        try {
            // 1. Create the Auth User using the secondary instance (so Admin isn't logged out)
            const fakeEmail = `${formData.telefono}@casalegal.com`;
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, fakeEmail, formData.password);
            const uid = userCredential.user.uid;
            
            // Sign out the secondary instance immediately just to be safe
            await signOut(secondaryAuth);

            // 2. Add employee to Firestore
            const { password, ...empleadoData } = formData;
            await addEmpleado({
                ...empleadoData,
                authUid: uid
            });
            
            showModal = false;
            formData = { nombre: '', apellidos: '', rol: 'Abogado', telefono: '', password: '' };
        } catch (error) {
            console.error(error);
            alert("Error al crear empleado: " + error.message);
        } finally {
            isSubmitting = false;
        }
    }

    async function handleDelete(id) {
        if (confirm('¿Eliminar este empleado del equipo?')) {
            await deleteEmpleado(id);
        }
    }
</script>

<div class="p-lg space-y-lg max-w-[1000px] mx-auto w-full">
    <div class="flex justify-between items-end mb-xl">
        <div>
            <h2 class="font-headline-xl text-on-surface">Equipo Legal</h2>
            <p class="text-on-surface-variant mt-xs">Gestiona tu equipo para poder delegarles tareas en la agenda.</p>
        </div>
        <button onclick={() => showModal = true} class="bg-primary text-on-primary px-md py-sm rounded-lg font-bold flex items-center gap-xs">
            <span class="material-symbols-outlined">person_add</span> Registrar Empleado
        </button>
    </div>

    {#if loading}
        <div class="flex justify-center p-xl">
            <span class="material-symbols-outlined animate-spin text-[40px] text-primary">progress_activity</span>
        </div>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {#each empleados as emp}
                <div class="bg-surface rounded-2xl p-md border border-outline-variant shadow-sm flex flex-col items-center text-center relative group">
                    <button onclick={() => handleDelete(emp.id)} class="absolute top-sm right-sm text-error opacity-0 group-hover:opacity-100 transition-opacity p-xs hover:bg-error/10 rounded-full">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                    
                    <div class="w-16 h-16 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-[24px] font-bold mb-md">
                        {emp.nombre.charAt(0)}{emp.apellidos.charAt(0)}
                    </div>
                    <h3 class="font-bold text-headline-md">{emp.nombre} {emp.apellidos}</h3>
                    <p class="text-secondary font-bold text-label-sm mt-xs px-sm py-[2px] bg-secondary-container/30 rounded-full">{emp.rol}</p>
                    <p class="text-on-surface-variant text-body-md mt-sm flex items-center gap-xs justify-center">
                        <span class="material-symbols-outlined text-[16px]">phone</span> {emp.telefono}
                    </p>
                </div>
            {:else}
                <div class="col-span-full text-center py-xl text-on-surface-variant">
                    <span class="material-symbols-outlined text-[64px] opacity-50 mb-md">groups</span>
                    <p>No hay empleados registrados. Añade uno para comenzar a delegar tareas.</p>
                </div>
            {/each}
        </div>
    {/if}
</div>

{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-on-background/40 backdrop-blur-sm p-4">
        <div class="bg-surface rounded-2xl w-[95vw] max-w-[500px] shadow-2xl overflow-hidden border border-outline-variant animate-in fade-in zoom-in-95 duration-200">
            <div class="px-lg py-md bg-primary-container text-on-primary-container flex justify-between items-center">
                <h3 class="font-bold font-headline-md flex items-center gap-xs">
                    <span class="material-symbols-outlined">person_add</span> Nuevo Empleado
                </h3>
                <button onclick={() => showModal = false} class="hover:bg-black/10 p-xs rounded-full">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <form onsubmit={handleSubmit} class="p-lg space-y-md">
                <div class="grid grid-cols-2 gap-md">
                    <div class="space-y-xs">
                        <label class="text-label-sm font-bold text-on-surface-variant">Nombre</label>
                        <input type="text" bind:value={formData.nombre} required class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md outline-none focus:ring-2 focus:ring-primary/30">
                    </div>
                    <div class="space-y-xs">
                        <label class="text-label-sm font-bold text-on-surface-variant">Apellidos</label>
                        <input type="text" bind:value={formData.apellidos} required class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md outline-none focus:ring-2 focus:ring-primary/30">
                    </div>
                </div>
                
                <div class="space-y-xs">
                    <label class="text-label-sm font-bold text-on-surface-variant">Rol / Cargo</label>
                    <select bind:value={formData.rol} class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md outline-none focus:ring-2 focus:ring-primary/30">
                        <option value="Abogado">Abogado Principal</option>
                        <option value="Asistente Legal">Asistente Legal</option>
                        <option value="Secretaría">Secretaría</option>
                        <option value="Administrador">Administrador</option>
                    </select>
                </div>

                <div class="space-y-xs">
                    <label class="text-label-sm font-bold text-on-surface-variant">Teléfono</label>
                    <input type="tel" bind:value={formData.telefono} required placeholder="Ej. 5512345678" class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md outline-none focus:ring-2 focus:ring-primary/30">
                </div>

                <div class="space-y-xs">
                    <label class="text-label-sm font-bold text-on-surface-variant">Contraseña de Acceso</label>
                    <input type="password" bind:value={formData.password} required placeholder="Mínimo 6 caracteres" class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md outline-none focus:ring-2 focus:ring-primary/30">
                    <p class="text-[10px] text-on-surface-variant mt-1">Esta es la contraseña que usará para entrar al sistema.</p>
                </div>

                <div class="pt-md flex justify-end gap-sm">
                    <button type="button" onclick={() => showModal = false} class="px-md py-sm rounded-lg font-bold text-on-surface-variant hover:bg-surface-container">Cancelar</button>
                    <button type="submit" disabled={isSubmitting} class="px-md py-sm bg-primary text-on-primary rounded-lg font-bold shadow-sm hover:opacity-90 disabled:opacity-50">Guardar Empleado</button>
                </div>
            </form>
        </div>
    </div>
{/if}
