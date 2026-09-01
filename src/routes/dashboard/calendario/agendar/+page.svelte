<script>
    import { goto } from '$app/navigation';
    
    let isScheduling = false;
    let scheduled = false;

    function scheduleMeeting() {
        isScheduling = true;
        // Simulate API call
        setTimeout(() => {
            isScheduling = false;
            scheduled = true;
            setTimeout(() => {
                goto('/dashboard');
            }, 2000);
        }, 1500);
    }
</script>

<div class="p-lg max-w-[800px] mx-auto w-full">
    <div class="mb-xl flex items-center gap-md">
        <button onclick={() => goto(-1)} class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high transition-colors">
            <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
            <h2 class="text-headline-xl font-headline-xl text-on-surface">Agendar Reunión</h2>
            <p class="text-body-lg text-on-surface-variant">Programa una nueva cita con clientes o equipo interno.</p>
        </div>
    </div>

    {#if scheduled}
        <div class="bg-primary/10 border-2 border-primary text-primary p-xl rounded-2xl mb-lg text-center font-bold text-headline-md flex flex-col items-center gap-md animation-scale">
            <span class="material-symbols-outlined text-[64px]">event_available</span>
            ¡Reunión Agendada Exitosamente!
            <p class="text-body-md font-normal text-on-surface-variant">Redirigiendo al dashboard...</p>
        </div>
    {:else}
        <div class="glass-card rounded-2xl overflow-hidden shadow-sm">
            <form onsubmit={(e) => { e.preventDefault(); scheduleMeeting(); }} class="p-xl space-y-lg">
                <!-- Tipo de Reunión -->
                <div>
                    <label class="block text-label-sm text-on-surface-variant font-bold mb-sm uppercase">Asunto / Tipo de Reunión</label>
                    <input type="text" placeholder="Ej. Conciliación Caso #772-23" required class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-md px-md text-headline-md focus:ring-2 focus:ring-primary/20">
                </div>

                <!-- Fecha y Hora -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-lg">
                    <div class="space-y-xs">
                        <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Fecha</label>
                        <div class="relative">
                            <span class="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">calendar_today</span>
                            <input type="date" required class="w-full pl-12 bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                        </div>
                    </div>
                    <div class="space-y-xs">
                        <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Hora</label>
                        <div class="relative">
                            <span class="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">schedule</span>
                            <input type="time" required class="w-full pl-12 bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                        </div>
                    </div>
                </div>

                <!-- Participantes -->
                <div class="space-y-xs">
                    <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Participantes (Emails separados por coma)</label>
                    <div class="relative">
                        <span class="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">group</span>
                        <input type="text" placeholder="cliente@email.com, abogado@casalegal.com" required class="w-full pl-12 bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20">
                    </div>
                </div>

                <!-- Modalidad -->
                <div class="space-y-sm">
                    <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Modalidad</label>
                    <div class="flex gap-md">
                        <label class="flex-1 flex items-center gap-sm p-md border border-outline-variant rounded-xl cursor-pointer hover:bg-surface-container transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:text-primary">
                            <input type="radio" name="modalidad" value="virtual" class="text-primary focus:ring-primary" checked>
                            <span class="material-symbols-outlined">videocam</span>
                            <span class="font-bold">Virtual (Meet/Zoom)</span>
                        </label>
                        <label class="flex-1 flex items-center gap-sm p-md border border-outline-variant rounded-xl cursor-pointer hover:bg-surface-container transition-colors has-[:checked]:border-secondary has-[:checked]:bg-secondary/5 has-[:checked]:text-secondary">
                            <input type="radio" name="modalidad" value="presencial" class="text-secondary focus:ring-secondary">
                            <span class="material-symbols-outlined">domain</span>
                            <span class="font-bold">Presencial (Oficina)</span>
                        </label>
                    </div>
                </div>

                <!-- Detalles -->
                <div class="space-y-xs">
                    <label class="block text-label-sm text-on-surface-variant font-bold uppercase">Detalles / Enlace</label>
                    <textarea rows="3" placeholder="Añade contexto o enlace a la reunión..." class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md focus:ring-2 focus:ring-primary/20"></textarea>
                </div>

                <!-- Acción -->
                <div class="pt-lg flex justify-end">
                    <button type="submit" disabled={isScheduling} class="w-full md:w-auto px-xl py-md rounded-xl font-bold bg-primary text-on-primary shadow-lg shadow-primary/20 hover:scale-105 transition-transform disabled:scale-100 disabled:opacity-70 flex items-center justify-center gap-sm text-headline-md">
                        {#if isScheduling}
                            <span class="material-symbols-outlined animate-spin">progress_activity</span> Programando...
                        {:else}
                            <span class="material-symbols-outlined">event_available</span> Confirmar Reunión
                        {/if}
                    </button>
                </div>
            </form>
        </div>
    {/if}
</div>

<style>
    .animation-scale {
        animation: pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    @keyframes pop {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
    }
</style>
