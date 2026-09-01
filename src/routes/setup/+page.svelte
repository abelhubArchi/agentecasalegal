<script>
    import { authStore } from '$lib/stores/auth.js';
    import { db, doc, setDoc } from '$lib/firebase/client.js';
    import { goto } from '$app/navigation';

    let isSaving = false;

    async function selectGuide(guideName) {
        if (isSaving || !$authStore.user) return;
        isSaving = true;

        try {
            const userRef = doc(db, 'users', $authStore.user.uid);
            await setDoc(userRef, { guide: guideName }, { merge: true });
            
            // Update local store
            authStore.updateProfile({ guide: guideName });
            
            // Layout will handle routing, but we can push it just in case
            goto('/dashboard');
        } catch (error) {
            console.error("Error saving guide:", error);
            alert("Hubo un error al guardar tu selección.");
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="setup-container">
    <div class="header">
        <h1>Elige a tu Guía Legal</h1>
        <p>Selecciona el perfil que mejor se adapte a tu estilo de trabajo. Podrás cambiarlo después.</p>
    </div>

    <div class="cards-grid">
        <!-- Zeus Card -->
        <button class="glass-panel guide-card zeus" on:click={() => selectGuide('Zeus')} disabled={isSaving}>
            <div class="glow-bg"></div>
            <div class="image-wrapper">
                <img src="/src/lib/assets/zeus.jfif" alt="Zeus" />
            </div>
            <h2>Zeus</h2>
            <p class="description">Autoridad, estrategia y visión global. Ideal para litigios complejos y dirección general.</p>
            <div class="traits">
                <span>Estratégico</span>
                <span>Directo</span>
                <span>Autoritario</span>
            </div>
        </button>

        <!-- Freya Card -->
        <button class="glass-panel guide-card freya" on:click={() => selectGuide('Freya')} disabled={isSaving}>
            <div class="glow-bg"></div>
            <div class="image-wrapper">
                <img src="/src/lib/assets/freya.webp" alt="Freya" />
            </div>
            <h2>Freya</h2>
            <p class="description">Sabiduría, análisis detallado y mediación. Excelente para negociaciones y revisión de contratos.</p>
            <div class="traits">
                <span>Analítica</span>
                <span>Empática</span>
                <span>Detallista</span>
            </div>
        </button>
    </div>
</div>

<style>
    .setup-container {
        min-height: 100vh;
        padding: 4rem 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .header {
        text-align: center;
        margin-bottom: 4rem;
        max-width: 600px;
        animation: fadeInDown 0.8s ease-out;
    }

    .header h1 {
        font-size: 2.5rem;
        font-weight: 700;
        margin-bottom: 1rem;
        color: var(--text-main);
    }

    .header p {
        color: var(--text-muted);
        font-size: 1.1rem;
        line-height: 1.6;
    }

    .cards-grid {
        display: flex;
        gap: 3rem;
        max-width: 1000px;
        width: 100%;
        justify-content: center;
        flex-wrap: wrap;
    }

    .guide-card {
        flex: 1;
        min-width: 300px;
        max-width: 400px;
        padding: 2.5rem;
        text-align: center;
        position: relative;
        overflow: hidden;
        cursor: pointer;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        color: var(--text-main);
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .guide-card:hover {
        transform: translateY(-10px);
    }

    .guide-card:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
    }

    .glow-bg {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 150px;
        opacity: 0;
        transition: opacity 0.4s;
        z-index: 0;
    }

    .guide-card:hover .glow-bg {
        opacity: 1;
    }

    .zeus .glow-bg {
        background: radial-gradient(circle at top, rgba(251, 191, 36, 0.2) 0%, transparent 70%);
    }

    .freya .glow-bg {
        background: radial-gradient(circle at top, rgba(192, 132, 252, 0.2) 0%, transparent 70%);
    }

    .image-wrapper {
        position: relative;
        z-index: 1;
        width: 160px;
        height: 160px;
        border-radius: 50%;
        margin-bottom: 2rem;
        padding: 5px;
        background: var(--glass-border);
        transition: transform 0.4s;
    }

    .guide-card:hover .image-wrapper {
        transform: scale(1.05);
    }

    .zeus .image-wrapper {
        background: linear-gradient(135deg, #f59e0b, transparent);
        box-shadow: 0 0 30px rgba(251, 191, 36, 0.3);
    }

    .freya .image-wrapper {
        background: linear-gradient(135deg, #a855f7, transparent);
        box-shadow: 0 0 30px rgba(192, 132, 252, 0.3);
    }

    .image-wrapper img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
        border: 4px solid var(--pure-white);
    }

    .guide-card h2 {
        position: relative;
        z-index: 1;
        font-size: 2rem;
        margin-bottom: 1rem;
    }

    .zeus h2 { color: #d97706; }
    .freya h2 { color: #7e22ce; }

    .description {
        position: relative;
        z-index: 1;
        color: var(--text-muted);
        margin-bottom: 2rem;
        line-height: 1.5;
        flex-grow: 1;
    }

    .traits {
        position: relative;
        z-index: 1;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: center;
    }

    .traits span {
        padding: 0.4rem 0.8rem;
        border-radius: 2rem;
        font-size: 0.8rem;
        font-weight: 600;
        background: rgba(0, 0, 0, 0.05);
        border: 1px solid #d1d5db;
        color: var(--text-main);
    }

    .zeus:hover { border-color: #f59e0b; box-shadow: 0 8px 32px rgba(251, 191, 36, 0.15); }
    .freya:hover { border-color: #a855f7; box-shadow: 0 8px 32px rgba(192, 132, 252, 0.15); }

    @keyframes fadeInDown {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
