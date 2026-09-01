<script>
    import '../app.css';
    import { onMount } from 'svelte';
    import { authStore } from '$lib/stores/auth.js';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    onMount(() => {
        authStore.init();
    });

    $effect(() => {
        // Routing logic based on auth state
        if (!$authStore.loading) {
            const isSetupPage = $page.url.pathname.startsWith('/setup');
            const isDashboard = $page.url.pathname.startsWith('/dashboard');
            const isLogin = $page.url.pathname === '/';

            if ($authStore.user) {
                // User is logged in
                if ($authStore.profile?.guide) {
                    // Has guide selected
                    if (isLogin || isSetupPage) {
                        goto('/dashboard');
                    }
                } else {
                    // No guide selected yet
                    if (!isSetupPage) {
                        goto('/setup');
                    }
                }
            } else {
                // User is NOT logged in
                if (!isLogin) {
                    goto('/');
                }
            }
        }
    });
</script>

<svelte:head>
    <title>Casa Legal Plan - AI Management</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
</svelte:head>

{#if $authStore.loading}
    <div class="loading-screen">
        <span class="loader"></span>
    </div>
{:else}
    <slot />
{/if}
