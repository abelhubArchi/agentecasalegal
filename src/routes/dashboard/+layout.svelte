<script>
    import Sidebar from '$lib/components/Sidebar.svelte';
    import Header from '$lib/components/Header.svelte';
    import { onMount, onDestroy } from 'svelte';
    import { subscribeToTransacciones } from '$lib/firebase/finanzas.js';
    import { subscribeToEmpleados } from '$lib/firebase/empleados.js';
    import { authStore } from '$lib/stores/auth.js';
    import { modoCelular, sidebarOpen } from '$lib/stores/ui.js';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    let unsubscribeT = null;
    let unsubscribeE = null;
    let empleados = [];
    let initialLoad = true; // To prevent alerting for existing transactions on load

    onMount(() => {
        // Solicitar permisos de notificación
        if (typeof window !== 'undefined' && "Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }

        unsubscribeE = subscribeToEmpleados(data => {
            empleados = data;
        });

        unsubscribeT = subscribeToTransacciones(data => {
            if (initialLoad) {
                initialLoad = false;
                return;
            }

            // Si hay un nuevo dato, data[0] suele ser el más reciente por el orderBy('fechaHora', 'desc')
            const latest = data[0];
            if (!latest) return;
            
            const currentEmpleado = empleados.find(e => e.authUid === $authStore.user?.uid);
            const isAdministrador = !currentEmpleado || currentEmpleado.rol === 'Administrador';
            
            // Si es administrador y la transacción NO fue creada por él
            if (isAdministrador && latest.creadoPor && latest.creadoPor !== $authStore.user?.uid) {
                const creador = empleados.find(e => e.authUid === latest.creadoPor);
                const nombreCreador = creador ? creador.nombre : 'Un empleado';
                
                if (typeof window !== 'undefined' && "Notification" in window && Notification.permission === "granted") {
                    new Notification("Nuevo Movimiento", {
                        body: `${nombreCreador} registró un ${latest.tipo}: ${latest.concepto} por $${latest.monto}`,
                        icon: 'https://cdn-icons-png.flaticon.com/512/3277/3277490.png'
                    });
                }
            }
        });
    });

    onDestroy(() => {
        if (unsubscribeT) unsubscribeT();
        if (unsubscribeE) unsubscribeE();
    });
</script>

<div class="flex h-screen bg-background overflow-hidden relative">
    {#if !$modoCelular}
        <Sidebar />
        
        <!-- Mobile Sidebar Overlay -->
        {#if $sidebarOpen}
            <div class="fixed inset-0 bg-black/50 z-40 md:hidden" onclick={() => $sidebarOpen = false} onkeydown={(e) => e.key === 'Escape' && ($sidebarOpen = false)} role="button" tabindex="0" aria-label="Close Sidebar"></div>
        {/if}
    {/if}
    
    <div class="flex-1 flex flex-col {$modoCelular ? 'pl-0' : 'pl-0 md:pl-[260px]'} transition-all w-full">
        {#if !$modoCelular}
            <Header />
        {/if}
        
        <main class="flex-1 overflow-y-auto {$modoCelular ? 'pb-20' : ''}">
            <slot />
        </main>
    </div>

    <!-- Mobile Bottom Navigation for Quick Modes -->
    {#if $modoCelular}
        <div class="fixed bottom-0 left-0 w-full bg-surface border-t border-outline-variant shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-50 flex justify-around items-center p-sm pb-safe h-[72px]">
            <button onclick={() => goto('/dashboard/cuentas')} class="flex flex-col items-center gap-1 flex-1 py-1 {$page.url.pathname.includes('/cuentas') ? 'text-primary' : 'text-on-surface-variant'} transition-colors">
                <span class="material-symbols-outlined text-[28px] {$page.url.pathname.includes('/cuentas') ? 'font-variation-settings:\'FILL\'_1' : ''}">payments</span>
                <span class="text-[11px] font-bold">Gastos</span>
            </button>
            <button onclick={() => goto('/dashboard/clientes')} class="flex flex-col items-center gap-1 flex-1 py-1 {$page.url.pathname.includes('/clientes') ? 'text-secondary' : 'text-on-surface-variant'} transition-colors">
                <span class="material-symbols-outlined text-[28px] {$page.url.pathname.includes('/clientes') ? 'font-variation-settings:\'FILL\'_1' : ''}">desk</span>
                <span class="text-[11px] font-bold">Recepción</span>
            </button>
            <button onclick={() => { $modoCelular = false; goto('/dashboard'); }} class="flex flex-col items-center gap-1 flex-1 py-1 text-on-surface-variant hover:text-error transition-colors">
                <span class="material-symbols-outlined text-[28px]">exit_to_app</span>
                <span class="text-[11px] font-bold">Salir Modo</span>
            </button>
        </div>
    {/if}
</div>
