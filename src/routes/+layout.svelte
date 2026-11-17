<script>
    import '../app.css';
    import { onMount } from 'svelte';
    import { authStore } from '$lib/stores/auth.js';
    import { empresaStore } from '$lib/stores/empresa.js';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { updateBrowserIcons } from '$lib/utils/imageOptimizer.js';

    onMount(() => {
        authStore.init();
        empresaStore.init();
    });

    $effect(() => {
        if ($empresaStore?.logoUrl) {
            updateBrowserIcons($empresaStore.logoUrl);
        }
    });

    $effect(() => {
        if (typeof window !== 'undefined' && ($page.url.pathname.startsWith('/dashboard') || $page.url.pathname.startsWith('/presentacion'))) {
            localStorage.setItem('lastPath', $page.url.pathname);
        }
    });

    $effect(() => {
        // Routing logic based on auth state
        if (!$authStore.loading) {
            const pathname = $page.url.pathname;
            const isSetupPage = pathname.startsWith('/setup');
            const isDashboard = pathname.startsWith('/dashboard');
            const isPresentacion = pathname.startsWith('/presentacion');
            const isChatLegalPublic = pathname.startsWith('/chatlegal/') || pathname.startsWith('/secreto/');
            const isCustomFirmPortal = !!$page.params.empresaSlug;
            const isLogin = pathname === '/' || isCustomFirmPortal;

            if ($authStore.user) {
                // User is logged in
                const hasGuide = $authStore.profile?.guide;
                const isEmployee = $authStore.profile?.rol || $authStore.profile?.nivelAcceso;

                if (hasGuide || isEmployee) {
                    // Has guide selected or is an employee
                    if (pathname === '/' || isSetupPage) {
                        const lastPath = (typeof window !== 'undefined' && localStorage.getItem('lastPath')) || '/dashboard';
                        goto(lastPath.startsWith('/dashboard') || lastPath.startsWith('/presentacion') ? lastPath : '/dashboard');
                    }
                } else {
                    // No guide selected yet
                    if (!isSetupPage && !isChatLegalPublic && !isPresentacion && !isCustomFirmPortal) {
                        goto('/setup');
                    }
                }
            } else {
                // User is NOT logged in
                if (!isLogin && !isChatLegalPublic) {
                    goto('/');
                }
            }
        }
    });
</script>

<svelte:head>
    <title>{$empresaStore?.nombre ? `${$empresaStore.nombre} - Sistema de Gestión Legal` : 'Casa Legal Plan - AI Management'}</title>
    {#if $empresaStore?.logoUrl}
        <link rel="icon" type="image/png" href={$empresaStore.logoUrl} />
        <link rel="apple-touch-icon" href={$empresaStore.logoUrl} />
    {:else}
        <link rel="icon" type="image/png" href="/legal.png" />
        <link rel="apple-touch-icon" href="/legal.png" />
    {/if}
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content={$empresaStore?.nombre || 'Casa Legal'} />
    <meta name="application-name" content={$empresaStore?.nombre || 'Casa Legal'} />
    <meta name="theme-color" content={$empresaStore?.colorPrimario || '#006a39'} />
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Source+Sans+3:ital,wght@0,300..900;1,300..900&family=Source+Serif+4:ital,opsz,wght@0,8..60,300..900;1,8..60,300..900&family=Share+Tech+Mono&family=Fira+Code:wght@400;500;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
</svelte:head>

{#if $authStore.loading}
    <div class="loading-screen">
        <span class="loader"></span>
    </div>
{:else}
    <slot />
{/if}
