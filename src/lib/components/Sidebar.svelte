<script>
    import { page } from '$app/stores';
    import logo from '$lib/assets/logo.webp';
    import { sidebarOpen } from '$lib/stores/ui.js';
    import { authStore } from '$lib/stores/auth.js';

    // Get current path to highlight active link
    let currentPath = $derived($page.url.pathname);

    let isAdmin = $derived($authStore.profile?.role === 'admin' || $authStore.profile?.nivelAcceso === 'admin' || $authStore.profile?.rol === 'Administrador');
    let modulos = $derived($authStore.profile?.modulosAccesibles || []);

    function canAccess(modulo) {
        if (isAdmin) return true;
        return modulos.includes(modulo);
    }

    function isActive(path, exact = false) {
        if (exact) {
            return currentPath === path;
        }
        return currentPath.startsWith(path) && currentPath !== '/dashboard';
    }

    $effect(() => {
        console.log("Current Profile in Sidebar:", $authStore.profile);
        console.log("isAdmin evaluated as:", isAdmin);
    });
</script>

<aside class="fixed left-0 top-0 h-full w-[260px] bg-[#1A1D1E] shadow-lg flex-col py-lg z-50 transition-transform duration-300 md:translate-x-0 {$sidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex">
    <div class="px-lg mb-xl flex items-center gap-sm">
        <div class="w-12 h-12 bg-white rounded-lg flex items-center justify-center p-1">
            <img src={logo} alt="Casa Legal Logo" class="w-full h-full object-contain" />
        </div>
        <div>
            <h1 class="text-headline-md font-headline-md font-bold text-secondary-fixed leading-tight">CASA LEGAL</h1>
            <p class="text-[10px] font-bold text-tertiary-fixed-dim uppercase tracking-widest mt-1">Firma Jurídica<br>e Inmobiliaria</p>
        </div>
    </div>
    
    <div class="px-md mb-lg">
        <button class="w-full bg-primary-container text-on-primary-container font-label-md py-sm rounded-lg flex items-center justify-center gap-xs hover:opacity-90 transition-all shadow-md shadow-primary/20">
            <span class="material-symbols-outlined">add</span>
            Nuevo Caso
        </button>
    </div>

    <nav class="flex-1 overflow-y-auto px-md space-y-xs custom-scrollbar">
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {currentPath === '/dashboard' ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard">
            <span class="material-symbols-outlined">dashboard</span>
            Dashboard
        </a>
        {#if canAccess('clientes')}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/clientes') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/clientes">
            <span class="material-symbols-outlined">groups</span>
            Clientes
        </a>
        {/if}
        {#if canAccess('casos')}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/casos') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/casos">
            <span class="material-symbols-outlined">folder_open</span>
            Casos
        </a>
        {/if}
        {#if canAccess('calendario')}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/calendario') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/calendario">
            <span class="material-symbols-outlined">event</span>
            Calendario
        </a>
        {/if}
        {#if isAdmin}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/equipo') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/equipo">
            <span class="material-symbols-outlined">badge</span>
            Equipo Legal
        </a>
        {/if}
        {#if canAccess('cuentas')}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/cuentas') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/cuentas">
            <span class="material-symbols-outlined">payments</span>
            Cuentas
        </a>
        {/if}
        {#if canAccess('documentos')}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/documentos') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/documentos">
            <span class="material-symbols-outlined">description</span>
            Documentos
        </a>
        {/if}
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/chatflau') ? 'border-l-4 border-[#00ff00] text-[#00ff00] bg-black font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/chatflau">
            <span class="material-symbols-outlined {isActive('/dashboard/chatflau') ? 'text-[#00ff00]' : ''}">terminal</span>
            Chat Flau Beta
        </a>
    </nav>
    
    <div class="mt-auto px-md pt-lg border-t border-surface-container-highest/10 space-y-xs">
        <a class="flex items-center gap-md px-md py-sm rounded-lg transition-all font-label-md text-label-md {isActive('/dashboard/settings') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'}" href="/dashboard/settings">
            <span class="material-symbols-outlined">settings</span>
            Configuración
        </a>
        <a class="flex items-center gap-md px-md py-sm rounded-lg {isActive('/dashboard/soporte') ? 'border-l-4 border-secondary text-secondary-fixed bg-surface-container-highest/10 font-bold' : 'text-tertiary-fixed-dim hover:text-secondary-fixed hover:bg-surface-container-highest/5'} transition-all font-label-md text-label-md" href="/dashboard/soporte">
            <span class="material-symbols-outlined">help</span>
            Soporte
        </a>
    </div>
</aside>
