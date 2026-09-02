<script>
    import { onMount, onDestroy } from 'svelte';
    import { subscribeToEmpleados, addEmpleado, deleteEmpleado, updateEmpleado } from '$lib/firebase/empleados.js';
    import { secondaryAuth, createUserWithEmailAndPassword, signOut } from '$lib/firebase/client.js';
    import { authStore } from '$lib/stores/auth.js';
    import { goto } from '$app/navigation';

    let empleados = $state([]);
    let unsubscribe = null;
    let loading = $state(true);
    let showModal = $state(false);
    let isSubmitting = $state(false);
    
    let formData = $state({
        nombre: '',
        apellidos: '',
        rol: 'Abogado',
        nivelAcceso: 'colaborador',
        telefono: '',
        password: ''
    });

    onMount(() => {
        if ($authStore.profile?.nivelAcceso !== 'admin' && $authStore.profile?.role !== 'admin') {
            alert("Acceso denegado. Solo administradores pueden ver esta página.");
            goto('/dashboard');
            return;
        }

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
            formData = { nombre: '', apellidos: '', rol: 'Abogado', nivelAcceso: 'colaborador', telefono: '', password: '' };
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

    let showPermisosModal = $state(false);
    let empAEditar = $state(null);
    let modulosSeleccionados = $state([]);
    let isGeneralAdminModal = $state(false);

    const modulosDisponibles = [
        { id: 'clientes', label: 'Clientes (Registro y Visitas)' },
        { id: 'casos', label: 'Casos (Trámites y Procesos)' },
        { id: 'calendario', label: 'Calendario' },
        { id: 'cuentas', label: 'Cuentas (Sus ingresos/egresos)' },
        { id: 'documentos', label: 'Documentos' }
    ];

    function abrirPermisos(emp) {
        empAEditar = emp;
        modulosSeleccionados = emp.modulosAccesibles || [];
        isGeneralAdminModal = emp.nivelAcceso === 'admin' || emp.rol === 'Administrador';
        showPermisosModal = true;
    }

    async function handleGuardarPermisos() {
        if (!empAEditar) return;
        isSubmitting = true;
        try {
            await updateEmpleado(empAEditar.id, { 
                modulosAccesibles: modulosSeleccionados,
                nivelAcceso: isGeneralAdminModal ? 'admin' : 'colaborador',
                rol: isGeneralAdminModal ? 'Administrador' : (empAEditar.rol === 'Administrador' ? 'Abogado' : empAEditar.rol)
            });
            showPermisosModal = false;
        } catch(error) {
            alert('Error guardando permisos.');
        } finally {
            isSubmitting = false;
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
                    <div class="absolute top-sm right-sm flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick={() => abrirPermisos(emp)} class="text-secondary p-xs hover:bg-secondary/10 rounded-full" title="Editar Permisos (Módulos)">
                            <span class="material-symbols-outlined text-[20px]">vpn_key</span>
                        </button>
                        <button onclick={() => handleDelete(emp.id)} class="text-error p-xs hover:bg-error/10 rounded-full" title="Eliminar Empleado">
                            <span class="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                    </div>
                    
                    <div class="w-16 h-16 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-[24px] font-bold mb-md">
                        {emp.nombre.charAt(0)}{emp.apellidos.charAt(0)}
                    </div>
                    <h3 class="font-bold text-headline-md">{emp.nombre} {emp.apellidos}</h3>
                    <div class="flex gap-2 mt-xs">
                        <p class="text-secondary font-bold text-label-sm px-sm py-[2px] bg-secondary-container/30 rounded-full">{emp.rol}</p>
                        <p class="text-primary font-bold text-label-sm px-sm py-[2px] bg-primary/10 rounded-full">{emp.nivelAcceso === 'admin' ? 'Admin. General' : 'Colaborador'}</p>
                    </div>
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
                
                <div class="grid grid-cols-2 gap-md">
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
                        <label class="text-label-sm font-bold text-on-surface-variant">Nivel de Acceso</label>
                        <select bind:value={formData.nivelAcceso} class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md outline-none focus:ring-2 focus:ring-primary/30">
                            <option value="colaborador">Colaborador (Acceso Limitado)</option>
                            <option value="admin">Administrador General (Acceso Total)</option>
                        </select>
                    </div>
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

{#if showPermisosModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-on-background/40 backdrop-blur-sm p-4">
        <div class="bg-surface rounded-2xl w-[95vw] max-w-[400px] shadow-2xl overflow-hidden border border-outline-variant animate-in fade-in zoom-in-95 duration-200">
            <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface-container-lowest">
                <h3 class="font-bold font-headline-sm text-on-surface">Módulos Permitidos</h3>
                <button onclick={() => showPermisosModal = false} class="hover:bg-surface-container p-xs rounded-full">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="p-lg space-y-sm">
                <p class="text-label-sm text-on-surface-variant mb-md">Selecciona los permisos para <strong>{empAEditar.nombre}</strong>.</p>
                
                <label class="flex items-start gap-3 p-4 mb-4 border-2 {isGeneralAdminModal ? 'border-[#D4AF37] bg-[#D4AF37]/10' : 'border-outline-variant hover:bg-surface-container-lowest'} rounded-xl cursor-pointer transition-colors shadow-sm">
                    <input type="checkbox" bind:checked={isGeneralAdminModal} class="mt-1 w-5 h-5 rounded border-outline-variant focus:ring-[#D4AF37]" style="accent-color: #D4AF37;">
                    <div>
                        <span class="font-bold text-body-lg {isGeneralAdminModal ? 'text-[#B8860B]' : 'text-on-surface'} flex items-center gap-2">
                            <span class="material-symbols-outlined">stars</span> Administrador General
                        </span>
                        <p class="text-label-sm {isGeneralAdminModal ? 'text-[#B8860B]/80' : 'text-on-surface-variant'} mt-1">Acceso absoluto a todos los módulos y configuraciones del sistema.</p>
                    </div>
                </label>
                
                {#if !isGeneralAdminModal}
                    <div class="pt-2 border-t border-outline-variant/30">
                        <p class="text-label-sm font-bold text-on-surface mb-3">Permisos Específicos (Colaborador):</p>
                        {#each modulosDisponibles as mod}
                            <label class="flex items-center gap-3 p-3 border border-outline-variant rounded-xl cursor-pointer hover:bg-surface-container-lowest transition-colors mb-2">
                                <input type="checkbox" bind:group={modulosSeleccionados} value={mod.id} class="w-5 h-5 text-primary rounded border-outline-variant focus:ring-primary">
                                <span class="font-bold text-body-md text-on-surface">{mod.label}</span>
                            </label>
                        {/each}
                    </div>
                {/if}
            </div>
            
            <div class="p-lg pt-0 flex justify-end gap-sm mt-4">
                <button type="button" onclick={() => showPermisosModal = false} class="px-md py-sm rounded-lg font-bold text-on-surface-variant hover:bg-surface-container">Cancelar</button>
                <button type="button" onclick={handleGuardarPermisos} disabled={isSubmitting} class="px-md py-sm bg-secondary text-on-secondary rounded-lg font-bold shadow-sm hover:opacity-90 disabled:opacity-50">Guardar Permisos</button>
            </div>
        </div>
    </div>
{/if}
