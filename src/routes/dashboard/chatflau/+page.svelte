<script>
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    
    onMount(() => {
        goto('/dashboard/chatlegal');
    });
</script>

<div class="h-full w-full bg-[#050907] flex items-center justify-center font-mono text-[#00ff66]">
    <div class="text-center space-y-2">
        <span class="material-symbols-outlined text-4xl animate-spin">sync</span>
        <p class="text-xs uppercase tracking-widest">REDIRECCIONANDO A CHAT LEGAL // PROTOCOLO SEGURO...</p>
    </div>
</div>
