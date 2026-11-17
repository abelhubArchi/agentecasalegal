<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import PageChatLegal from '../../chatlegal/[id]/+page.svelte';

    let id = $derived($page.params.id);

    onMount(() => {
        if (id) {
            goto(`/chatlegal/${id}`, { replaceState: true });
        }
    });
</script>

<PageChatLegal />
