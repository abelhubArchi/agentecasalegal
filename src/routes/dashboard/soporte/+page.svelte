<script>
    import { goto } from '$app/navigation';
</script>

<div class="p-4 md:p-lg max-w-[1200px] mx-auto w-full h-full flex flex-col">
    <div class="mb-lg">
        <h2 class="text-headline-lg font-headline-lg font-bold text-on-surface">Guía de Usuario y Soporte</h2>
        <p class="text-body-lg text-on-surface-variant mt-1">Aprende rápidamente cómo utilizar tu Firma Jurídica e Inmobiliaria</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-lg overflow-y-auto custom-scrollbar pb-xl">
        <!-- Dashboard -->
        <div class="bg-surface-container-lowest border border-outline-variant p-lg rounded-2xl shadow-sm hover:border-primary/50 transition-colors">
            <div class="w-12 h-12 bg-primary-container text-on-primary-container rounded-xl flex items-center justify-center mb-4">
                <span class="material-symbols-outlined text-[24px]">dashboard</span>
            </div>
            <h3 class="font-bold text-title-lg mb-2">1. Dashboard Principal</h3>
            <p class="text-body-md text-on-surface-variant mb-4">
                Es tu centro de mando. Aquí verás los indicadores clave de rendimiento (KPIs), ingresos, nuevos clientes y trámites activos de manera resumida para tomar decisiones rápidas.
            </p>
        </div>

        <!-- Clientes -->
        <div class="bg-surface-container-lowest border border-outline-variant p-lg rounded-2xl shadow-sm hover:border-primary/50 transition-colors">
            <div class="w-12 h-12 bg-[#ecfdf5] text-[#059669] rounded-xl flex items-center justify-center mb-4 border border-[#059669]/20">
                <span class="material-symbols-outlined text-[24px]">groups</span>
            </div>
            <h3 class="font-bold text-title-lg mb-2">2. Gestión de Clientes</h3>
            <p class="text-body-md text-on-surface-variant mb-4">
                Lleva el control de todos tus clientes. Puedes registrar sus datos personales (RFC/DNI) e incluso registrar <b>visitas físicas</b> cuando se presenten en recepción.
            </p>
            <ul class="list-disc pl-5 text-label-sm text-outline space-y-1">
                <li>Botón "Registrar Visita" para control de asistencia.</li>
                <li>Ficha completa de contacto.</li>
            </ul>
        </div>

        <!-- Casos / Trámites -->
        <div class="bg-surface-container-lowest border border-outline-variant p-lg rounded-2xl shadow-sm hover:border-primary/50 transition-colors">
            <div class="w-12 h-12 bg-[#eff6ff] text-[#2563eb] rounded-xl flex items-center justify-center mb-4 border border-[#2563eb]/20">
                <span class="material-symbols-outlined text-[24px]">folder_open</span>
            </div>
            <h3 class="font-bold text-title-lg mb-2">3. Trámites y Casos (Kanban)</h3>
            <p class="text-body-md text-on-surface-variant mb-4">
                El corazón jurídico. Utiliza el tablero visual (Kanban) para organizar los procesos legales. Simplemente <b>arrastra y suelta</b> las tarjetas entre las columnas: Pendiente, En Proceso, Adentro y Finalizado.
            </p>
            <ul class="list-disc pl-5 text-label-sm text-outline space-y-1">
                <li>Registro automático en la Bitácora al cambiar de estado.</li>
                <li>Línea de tiempo de avances por caso.</li>
            </ul>
        </div>

        <!-- Calendario y Campana -->
        <div class="bg-surface-container-lowest border border-outline-variant p-lg rounded-2xl shadow-sm hover:border-primary/50 transition-colors">
            <div class="w-12 h-12 bg-[#fffbeb] text-[#d97706] rounded-xl flex items-center justify-center mb-4 border border-[#d97706]/20">
                <span class="material-symbols-outlined text-[24px]">event</span>
            </div>
            <h3 class="font-bold text-title-lg mb-2">4. Agenda Inteligente</h3>
            <p class="text-body-md text-on-surface-variant mb-4">
                Programa audiencias, recordatorios y reuniones. La <b>Campana de Notificaciones</b> en la barra superior te avisará automáticamente sobre tus eventos urgentes próximos.
            </p>
        </div>

        <!-- Bóveda -->
        <div class="bg-surface-container-lowest border border-outline-variant p-lg rounded-2xl shadow-sm hover:border-primary/50 transition-colors">
            <div class="w-12 h-12 bg-[#fdf4ff] text-[#c026d3] rounded-xl flex items-center justify-center mb-4 border border-[#c026d3]/20">
                <span class="material-symbols-outlined text-[24px]">lock</span>
            </div>
            <h3 class="font-bold text-title-lg mb-2">5. Bóveda Documental</h3>
            <p class="text-body-md text-on-surface-variant mb-4">
                Sube contratos, sentencias e imágenes de forma segura a la nube. Al hacer clic en un archivo, usarás el "Visor de Documentos" integrado sin tener que descargarlo, o abrirlo en Google Docs para editar.
            </p>
        </div>

        <!-- Bitácora -->
        <div class="bg-surface-container-lowest border border-outline-variant p-lg rounded-2xl shadow-sm hover:border-primary/50 transition-colors">
            <div class="w-12 h-12 bg-secondary-container text-on-secondary-container rounded-xl flex items-center justify-center mb-4">
                <span class="material-symbols-outlined text-[24px]">history</span>
            </div>
            <h3 class="font-bold text-title-lg mb-2">6. Auditoría y Reloj</h3>
            <p class="text-body-md text-on-surface-variant mb-4">
                El icono del <b>Reloj</b> en el menú superior es un rastreador en tiempo real. Guarda un historial completo de <i>quién hizo qué y cuándo</i> (ej. cuando se sube un documento o se gasta dinero).
            </p>
        </div>
    </div>
</div>
