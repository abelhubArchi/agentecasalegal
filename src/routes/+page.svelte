<script>
    import { auth, signInWithEmailAndPassword } from '$lib/firebase/client.js';
    import { authStore } from '$lib/stores/auth.js';
    import logo from '$lib/assets/logo.webp';
    import { fade, fly } from 'svelte/transition';
    
    let telefono = '';
    let password = '';
    let errorMsg = '';
    let isLoading = false;

    async function handleLogin() {
        errorMsg = '';
        isLoading = true;
        try {
            // Convierte el teléfono en el identificador técnico de Firebase
            const fakeEmail = `${telefono}@casalegal.com`;
            await signInWithEmailAndPassword(auth, fakeEmail, password);
            // La redirección está manejada por +layout.svelte (onAuthStateChanged)
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                errorMsg = 'Teléfono o contraseña incorrectos.';
            } else {
                errorMsg = 'Error al iniciar sesión. Inténtalo de nuevo.';
            }
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="page-wrapper">
    <!-- Background Watermark -->
    <div class="watermark-container">
        <img src={logo} alt="Watermark" class="watermark-logo" />
    </div>

    <!-- Animated decorative orbs -->
    <div class="orb orb-blue"></div>
    <div class="orb orb-green"></div>

    <main class="login-container">
        <div class="glass-panel login-card" in:fly={{ y: 20, duration: 800, delay: 200 }}>
            <div class="logo-wrapper">
                <img src={logo} alt="Casa Legal" class="main-logo" />
                <div class="logo-glow"></div>
            </div>
            
            <div class="header-text">
                <h2>Iniciar Sesión</h2>
                <p class="subtitle">Gestión Jurídica Inteligente</p>
            </div>

            {#if errorMsg}
                <div class="alert alert-error" in:fade>
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <span>{errorMsg}</span>
                </div>
            {/if}

            <form on:submit|preventDefault={handleLogin} class="auth-form">
                <div class="form-group">
                    <label for="telefono">Número de Teléfono</label>
                    <div class="input-wrapper">
                        <svg class="input-icon" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        <input type="tel" id="telefono" bind:value={telefono} required placeholder="Ingresa tu teléfono..." />
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="password">Contraseña</label>
                    <div class="input-wrapper">
                        <svg class="input-icon" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        <input type="password" id="password" bind:value={password} required placeholder="••••••••" />
                    </div>
                </div>

                <button type="submit" class="btn btn-primary w-full shadow-hover" disabled={isLoading}>
                    {#if isLoading}
                        <span class="loader-small"></span>
                        Iniciando...
                    {:else}
                        Entrar al Sistema
                    {/if}
                </button>
            </form>
            
            <p class="toggle-mode mt-md text-label-sm text-on-surface-variant">
                Si olvidaste tu contraseña, contacta al Administrador.
            </p>
        </div>
    </main>
</div>

<style>
    .page-wrapper {
        position: relative;
        min-height: 100vh;
        width: 100%;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    /* Ambient Background Effects */
    .orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(80px);
        opacity: 0.15;
        z-index: 0;
        animation: float 10s infinite ease-in-out alternate;
    }
    
    .orb-blue {
        width: 400px;
        height: 400px;
        background: var(--primary-blue);
        top: -10%;
        left: -10%;
    }

    .orb-green {
        width: 350px;
        height: 350px;
        background: var(--accent-green);
        bottom: -5%;
        right: -5%;
        animation-delay: -5s;
    }

    @keyframes float {
        0% { transform: translate(0, 0) scale(1); }
        100% { transform: translate(30px, 30px) scale(1.1); }
    }

    /* Watermark */
    .watermark-container {
        position: absolute;
        inset: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 0;
        pointer-events: none;
        opacity: 0.04;
    }

    .watermark-logo {
        width: 120vmin;
        height: 120vmin;
        object-fit: contain;
        transform: rotate(-15deg);
    }

    /* Layout */
    .login-container {
        position: relative;
        z-index: 10;
        width: 100%;
        max-width: 440px;
        padding: 1rem;
    }

    .login-card {
        padding: 3rem 2.5rem;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    /* Header & Logo */
    .logo-wrapper {
        position: relative;
        margin-bottom: 1.5rem;
    }

    .main-logo {
        width: 96px;
        height: 96px;
        border-radius: 50%;
        object-fit: cover;
        position: relative;
        z-index: 2;
        border: 2px solid rgba(0, 0, 0, 0.05);
        background: var(--pure-white);
    }

    .logo-glow {
        position: absolute;
        inset: -10px;
        background: var(--brand-gradient);
        border-radius: 50%;
        filter: blur(15px);
        opacity: 0.2;
        z-index: 1;
        animation: pulse-glow 3s infinite alternate;
    }

    @keyframes pulse-glow {
        0% { opacity: 0.1; transform: scale(0.95); }
        100% { opacity: 0.3; transform: scale(1.05); }
    }

    .header-text {
        text-align: center;
        margin-bottom: 2.5rem;
    }

    h2 {
        font-size: 1.75rem;
        font-weight: 700;
        letter-spacing: -0.025em;
        margin-bottom: 0.5rem;
        color: var(--text-main);
    }

    .subtitle {
        color: var(--text-muted);
        font-size: 0.95rem;
        font-weight: 400;
    }

    /* Alerts */
    .alert {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        padding: 1rem;
        border-radius: 0.75rem;
        margin-bottom: 1.5rem;
        font-size: 0.875rem;
        font-weight: 500;
    }

    .alert-error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: #ef4444;
    }

    /* Form Styles */
    .auth-form {
        width: 100%;
    }

    .form-group {
        margin-bottom: 1.25rem;
        width: 100%;
    }

    .form-group label {
        display: block;
        margin-bottom: 0.5rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--text-main);
        padding-left: 0.25rem;
    }

    .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
    }

    .input-icon {
        position: absolute;
        left: 1rem;
        color: var(--text-muted);
        transition: color 0.3s ease;
    }

    .input-wrapper input {
        width: 100%;
        padding: 0.875rem 1rem 0.875rem 3rem;
        border-radius: 0.75rem;
        background: var(--glass-input-bg);
        border: 1px solid #d1d5db;
        color: var(--text-main);
        font-family: inherit;
        font-size: 1rem;
        transition: all 0.3s ease;
    }

    .input-wrapper input:focus {
        outline: none;
        border-color: var(--primary-blue);
        background: var(--pure-white);
        box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
    }

    .input-wrapper input:focus + .input-icon,
    .input-wrapper:focus-within .input-icon {
        color: var(--primary-blue);
    }

    .w-full {
        width: 100%;
    }

    .shadow-hover {
        margin-top: 0.5rem;
    }

    /* Dividers */
    .divider {
        display: flex;
        align-items: center;
        width: 100%;
        margin: 2rem 0;
    }

    .divider::before,
    .divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: linear-gradient(to right, transparent, #e5e7eb, transparent);
    }

    .divider span {
        padding: 0 1rem;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        font-weight: 600;
    }

    /* Google Button */
    .google-btn {
        background: var(--pure-white);
        border: 1px solid #d1d5db;
        color: var(--text-main);
    }

    .google-btn:hover:not(:disabled) {
        background: #f9fafb;
        border-color: #9ca3af;
    }

    /* Footer Toggle */
    .toggle-mode {
        margin-top: 2rem;
        font-size: 0.875rem;
        color: var(--text-muted);
        text-align: center;
    }

    .link-btn {
        background: none;
        border: none;
        color: var(--primary-blue);
        cursor: pointer;
        font-weight: 600;
        font-size: inherit;
        padding: 0 0.25rem;
        transition: color 0.2s ease;
    }

    .link-btn:hover {
        color: var(--primary-blue-hover);
        text-decoration: underline;
    }

    /* Small Loader */
    .loader-small {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-bottom-color: white;
        border-radius: 50%;
        display: inline-block;
        animation: rotation 1s linear infinite;
    }
</style>
