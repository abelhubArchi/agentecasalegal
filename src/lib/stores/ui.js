import { writable } from 'svelte/store';

// Check if we are in browser to safely read from localStorage
const initialValue = typeof window !== 'undefined' ? localStorage.getItem('modoCelular') === 'true' : false;

export const modoCelular = writable(initialValue);
export const sidebarOpen = writable(false);

// Subscribe to changes and save to localStorage
if (typeof window !== 'undefined') {
    modoCelular.subscribe(value => {
        localStorage.setItem('modoCelular', value);
    });
}
