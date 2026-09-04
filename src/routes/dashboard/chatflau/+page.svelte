<script>
    import { onMount, onDestroy } from 'svelte';
    import { authStore } from '$lib/stores/auth.js';
    import { subscribeToEmpleados } from '$lib/firebase/empleados.js';
    import { subscribeToMessages, sendMessage, markAsRead, uploadChatImage } from '$lib/firebase/chatflau.js';

    // State
    let empleados = $state([]);
    let currentUser = $derived($authStore.user);
    let searchUserQuery = $state('');
    let selectedUser = $state(null);
    let unsubscribeEmpleados = null;
    let unsubscribeMessages = null;

    // Chat State
    let messages = $state([]);
    let currentMessage = $state('');
    let isPVDMode = $state(false);
    let imageFile = $state(null);
    let fileInputRef = $state(null);
    let isSending = $state(false);

    // Derived
    let filteredEmpleados = $derived(empleados.filter(e => 
        e.authUid !== currentUser?.uid && 
        (e.nombre.toLowerCase().includes(searchUserQuery.toLowerCase()) || 
         e.apellidos?.toLowerCase().includes(searchUserQuery.toLowerCase()))
    ));

    onMount(() => {
        unsubscribeEmpleados = subscribeToEmpleados(data => {
            empleados = data;
        });
    });

    onDestroy(() => {
        if (unsubscribeEmpleados) unsubscribeEmpleados();
        if (unsubscribeMessages) unsubscribeMessages();
    });

    function selectUser(user) {
        selectedUser = user;
        if (unsubscribeMessages) unsubscribeMessages();
        
        unsubscribeMessages = subscribeToMessages(currentUser.uid, user.authUid, (msgs) => {
            messages = msgs;
            processUnreadPVD(msgs);
            scrollToBottom();
        });
    }

    // Process PVD Messages (Mark as read and start self-destruct if we are the receptor)
    function processUnreadPVD(msgs) {
        msgs.forEach(msg => {
            if (msg.receptorId === currentUser.uid && !msg.leido && msg.isPVD) {
                // We just saw a PVD message meant for us. Mark as read (starts 2s destruct in backend)
                markAsRead(msg.id, true, msg.imageUrl);
            }
            if (msg.receptorId === currentUser.uid && !msg.leido && !msg.isPVD) {
                // Mark normal messages as read too, but no self-destruct
                markAsRead(msg.id, false);
            }
        });
    }

    let chatContainer;
    function scrollToBottom() {
        setTimeout(() => {
            if (chatContainer) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }, 100);
    }

    async function handleSendMessage(e) {
        e.preventDefault();
        if ((!currentMessage.trim() && !imageFile) || !selectedUser || isSending) return;

        isSending = true;
        try {
            let imageUrl = null;
            if (imageFile) {
                imageUrl = await uploadChatImage(imageFile);
            }
            
            await sendMessage(currentMessage, imageUrl, currentUser.uid, selectedUser.authUid, isPVDMode);
            
            currentMessage = '';
            imageFile = null;
            if (fileInputRef) fileInputRef.value = '';
            scrollToBottom();
        } catch (error) {
            console.error(error);
            alert("SYS_ERR: FAILED TO TRANSMIT");
        } finally {
            isSending = false;
        }
    }

    function formatTime(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
</script>

<div class="h-full w-full bg-[#050505] text-[#00ff00] font-mono flex flex-col md:flex-row relative overflow-hidden" style="font-family: 'Courier New', Courier, monospace;">
    
    <!-- CRT Overlay Effect -->
    <div class="pointer-events-none absolute inset-0 z-50 opacity-10" style="background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06)); background-size: 100% 2px, 3px 100%;"></div>

    <!-- Left Panel: Users -->
    <div class="w-full md:w-[320px] border-r border-[#00ff00]/30 flex flex-col h-[30vh] md:h-full shrink-0 bg-[#0a0a0a]">
        <div class="p-4 border-b border-[#00ff00]/30 bg-[#002200]/50">
            <h2 class="text-xl font-bold tracking-widest uppercase mb-1 glitch-text" data-text="CHAT FLAU BETA">CHAT FLAU BETA</h2>
            <p class="text-[10px] opacity-70 uppercase tracking-widest">// SECURE COMMS LINK ACTIVE</p>
        </div>
        
        <div class="p-4">
            <div class="relative">
                <span class="absolute left-3 top-2 opacity-50">&gt;</span>
                <input bind:value={searchUserQuery} type="text" placeholder="SEARCH_TARGET..." class="w-full bg-black border border-[#00ff00]/50 text-[#00ff00] p-2 pl-6 outline-none focus:border-[#00ff00] focus:shadow-[0_0_10px_rgba(0,255,0,0.3)] placeholder:text-[#00ff00]/30 transition-all text-sm uppercase">
            </div>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar-terminal">
            {#each filteredEmpleados as emp}
                <button onclick={() => selectUser(emp)} class="w-full text-left p-4 border-b border-[#00ff00]/10 hover:bg-[#00ff00]/10 transition-colors flex items-center gap-3 {selectedUser?.authUid === emp.authUid ? 'bg-[#00ff00]/20 border-l-4 border-l-[#00ff00]' : 'border-l-4 border-l-transparent'}">
                    <div class="w-10 h-10 bg-black border border-[#00ff00]/50 flex items-center justify-center font-bold overflow-hidden">
                        {#if emp.photoURL}
                            <img src={emp.photoURL} alt={emp.nombre} class="w-full h-full object-cover filter grayscale contrast-125 brightness-90">
                        {:else}
                            {emp.nombre.charAt(0)}
                        {/if}
                    </div>
                    <div>
                        <div class="font-bold uppercase text-sm">{emp.nombre} {emp.apellidos}</div>
                        <div class="text-[10px] opacity-60 uppercase">{emp.rol}</div>
                    </div>
                </button>
            {/each}
        </div>
    </div>

    <!-- Right Panel: Chat Area -->
    <div class="flex-1 flex flex-col h-[70vh] md:h-full bg-black relative">
        {#if !selectedUser}
            <div class="flex-1 flex flex-col items-center justify-center opacity-50 p-4 text-center">
                <span class="material-symbols-outlined text-[64px] mb-4">terminal</span>
                <p class="uppercase tracking-widest">AWAITING TARGET SELECTION...</p>
            </div>
        {:else}
            <!-- Chat Header -->
            <div class="p-4 border-b border-[#00ff00]/30 bg-[#0a0a0a] flex justify-between items-center shrink-0">
                <div>
                    <div class="text-sm font-bold uppercase tracking-wider">TARGET: {selectedUser.nombre} {selectedUser.apellidos}</div>
                    <div class="text-[10px] opacity-70 uppercase flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-[#00ff00] animate-pulse"></span>
                        ENCRYPTED CHANNEL ESTABLISHED
                    </div>
                </div>
            </div>

            <!-- Chat Messages -->
            <div bind:this={chatContainer} class="flex-1 overflow-y-auto p-4 custom-scrollbar-terminal flex flex-col gap-4">
                {#if messages.length === 0}
                    <div class="text-center opacity-50 text-sm uppercase mt-10">
                        -- NO PREVIOUS LOGS FOUND --
                    </div>
                {/if}

                {#each messages as msg (msg.id)}
                    {@const isMe = msg.emisorId === currentUser.uid}
                    <div class="flex flex-col {isMe ? 'items-end' : 'items-start'} animate-fade-in w-full">
                        
                        {#if msg.isPVD}
                            <div class="text-[9px] text-[#ff0000] font-bold uppercase mb-1 tracking-widest flex items-center gap-1">
                                <span class="material-symbols-outlined text-[12px]">warning</span> [PVD_ACTIVE] {msg.leido ? 'DESTRUCT_SEQ_INIT' : 'AWAITING_READ'}
                            </div>
                        {/if}

                        <div class="max-w-[80%] md:max-w-[60%] {msg.isPVD ? 'border border-[#ff0000]/50 bg-[#220000]/30 shadow-[0_0_10px_rgba(255,0,0,0.2)] text-[#ffaaaa]' : 'border border-[#00ff00]/30 bg-[#002200]/30'} p-3 rounded-none relative {msg.leido && msg.isPVD ? 'glitch-effect opacity-50' : ''}">
                            
                            <!-- Corner Accents -->
                            <div class="absolute top-0 left-0 w-2 h-2 border-t border-l {msg.isPVD ? 'border-[#ff0000]' : 'border-[#00ff00]'} -translate-x-[1px] -translate-y-[1px]"></div>
                            <div class="absolute bottom-0 right-0 w-2 h-2 border-b border-r {msg.isPVD ? 'border-[#ff0000]' : 'border-[#00ff00]'} translate-x-[1px] translate-y-[1px]"></div>

                            {#if msg.imageUrl}
                                <a href={msg.imageUrl} target="_blank" class="block mb-2 border border-[#00ff00]/30 p-1 hover:border-[#00ff00] transition-colors">
                                    <!-- svelte-ignore a11y_img_redundant_alt -->
                                    <img src={msg.imageUrl} alt="Transmitted Image" class="max-h-[200px] object-contain w-full filter {msg.isPVD ? 'grayscale sepia-[.5] hue-rotate-[-50deg]' : 'grayscale contrast-125 brightness-90'}">
                                </a>
                            {/if}
                            {#if msg.texto}
                                <p class="whitespace-pre-wrap text-sm break-words leading-relaxed">{msg.texto}</p>
                            {/if}
                            
                            <div class="text-[9px] opacity-50 mt-2 text-right uppercase flex justify-end gap-2">
                                <span>{formatTime(msg.fechaEnvio)}</span>
                                {#if isMe}
                                    <span>[{msg.leido ? 'READ' : 'SENT'}]</span>
                                {/if}
                            </div>
                        </div>
                    </div>
                {/each}
            </div>

            <!-- Chat Input -->
            <div class="p-4 border-t border-[#00ff00]/30 bg-[#0a0a0a] shrink-0">
                <form onsubmit={handleSendMessage} class="flex flex-col gap-2">
                    
                    <!-- PVD Toggle & File Info -->
                    <div class="flex justify-between items-center px-1">
                        <label class="flex items-center gap-2 cursor-pointer group">
                            <div class="relative w-10 h-5 bg-black border border-[#00ff00]/50 rounded-none transition-colors {isPVDMode ? 'border-[#ff0000] bg-[#330000]' : ''}">
                                <div class="absolute top-[2px] left-[2px] w-4 h-4 bg-[#00ff00]/50 transition-transform {isPVDMode ? 'translate-x-[20px] bg-[#ff0000]' : ''}"></div>
                            </div>
                            <input type="checkbox" bind:checked={isPVDMode} class="hidden">
                            <span class="text-[10px] font-bold uppercase tracking-widest {isPVDMode ? 'text-[#ff0000] animate-pulse' : 'text-[#00ff00]/50 group-hover:text-[#00ff00]'}">[PVD_MODE]</span>
                        </label>
                        
                        {#if imageFile}
                            <div class="text-[10px] bg-[#00ff00]/20 px-2 py-1 uppercase truncate max-w-[150px]">
                                FILE: {imageFile.name}
                            </div>
                        {/if}
                    </div>

                    <div class="flex gap-2 relative">
                        <input 
                            bind:this={fileInputRef}
                            type="file" 
                            accept="image/*"
                            class="hidden"
                            onchange={(e) => imageFile = e.target.files[0]}
                        >
                        <button type="button" onclick={() => fileInputRef.click()} class="p-3 bg-black border border-[#00ff00]/50 hover:bg-[#00ff00]/20 hover:border-[#00ff00] transition-colors shrink-0 flex items-center justify-center">
                            <span class="material-symbols-outlined text-[20px]">attach_file</span>
                        </button>
                        
                        <div class="relative flex-1">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50">&gt;</span>
                            <input bind:value={currentMessage} type="text" placeholder="TYPE_COMMAND..." class="w-full h-full bg-black border border-[#00ff00]/50 text-[#00ff00] p-3 pl-8 outline-none focus:border-[#00ff00] focus:shadow-[0_0_10px_rgba(0,255,0,0.3)] placeholder:text-[#00ff00]/30 transition-all uppercase">
                        </div>
                        
                        <button type="submit" disabled={isSending || (!currentMessage.trim() && !imageFile)} class="px-6 bg-black border border-[#00ff00]/50 hover:bg-[#00ff00] hover:text-black hover:shadow-[0_0_15px_rgba(0,255,0,0.5)] transition-all shrink-0 font-bold uppercase tracking-wider disabled:opacity-50 disabled:hover:bg-black disabled:hover:text-[#00ff00] disabled:cursor-not-allowed">
                            {#if isSending}
                                TX...
                            {:else}
                                SEND
                            {/if}
                        </button>
                    </div>
                </form>
            </div>
        {/if}
    </div>
</div>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
    }
    
    .custom-scrollbar-terminal::-webkit-scrollbar { width: 8px; height: 8px; }
    .custom-scrollbar-terminal::-webkit-scrollbar-track { background: #000000; border-left: 1px solid rgba(0,255,0,0.1); }
    .custom-scrollbar-terminal::-webkit-scrollbar-thumb { background: rgba(0,255,0,0.3); }
    .custom-scrollbar-terminal::-webkit-scrollbar-thumb:hover { background: rgba(0,255,0,0.6); }

    .animate-fade-in {
        animation: fadeIn 0.2s ease-out forwards;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .glitch-effect {
        animation: glitch-anim 0.2s infinite;
    }

    @keyframes glitch-anim {
        0% { transform: translate(0) }
        20% { transform: translate(-2px, 1px) }
        40% { transform: translate(-1px, -1px) }
        60% { transform: translate(2px, 1px) }
        80% { transform: translate(1px, -1px) }
        100% { transform: translate(0) }
    }

    /* Glitch text effect for title */
    .glitch-text {
        position: relative;
    }
    .glitch-text::before, .glitch-text::after {
        content: attr(data-text);
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: transparent;
    }
    .glitch-text::before {
        left: 2px;
        text-shadow: -1px 0 red;
        clip: rect(24px, 550px, 90px, 0);
        animation: glitch-anim-2 3s infinite linear alternate-reverse;
    }
    .glitch-text::after {
        left: -2px;
        text-shadow: -1px 0 blue;
        clip: rect(85px, 550px, 140px, 0);
        animation: glitch-anim-2 2.5s infinite linear alternate-reverse;
    }
    
    @keyframes glitch-anim-2 {
        0% { clip: rect(29px, 9999px, 14px, 0); }
        5% { clip: rect(61px, 9999px, 86px, 0); }
        10% { clip: rect(31px, 9999px, 81px, 0); }
        15% { clip: rect(29px, 9999px, 7px, 0); }
        20% { clip: rect(4px, 9999px, 76px, 0); }
        25% { clip: rect(66px, 9999px, 5px, 0); }
        30% { clip: rect(72px, 9999px, 34px, 0); }
        35% { clip: rect(46px, 9999px, 58px, 0); }
        40% { clip: rect(57px, 9999px, 20px, 0); }
        45% { clip: rect(61px, 9999px, 17px, 0); }
        50% { clip: rect(73px, 9999px, 13px, 0); }
        55% { clip: rect(59px, 9999px, 98px, 0); }
        60% { clip: rect(11px, 9999px, 3px, 0); }
        65% { clip: rect(98px, 9999px, 88px, 0); }
        70% { clip: rect(74px, 9999px, 81px, 0); }
        75% { clip: rect(6px, 9999px, 48px, 0); }
        80% { clip: rect(42px, 9999px, 46px, 0); }
        85% { clip: rect(6px, 9999px, 63px, 0); }
        90% { clip: rect(27px, 9999px, 100px, 0); }
        95% { clip: rect(13px, 9999px, 16px, 0); }
        100% { clip: rect(49px, 9999px, 60px, 0); }
    }
</style>
