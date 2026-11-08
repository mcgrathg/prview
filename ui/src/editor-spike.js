import { mount } from 'svelte';
import './app.css';
import ReadonlyEditorSpike from './lib/ReadonlyEditorSpike.svelte';
import { initTheme } from './lib/theme.svelte.js';
initTheme();
mount(ReadonlyEditorSpike, { target: document.getElementById('app') });
