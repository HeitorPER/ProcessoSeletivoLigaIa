/** Chave do navegador com a escolha de tema ("light" ou "dark"); sem ela, vale a preferência do sistema. */
export const THEME_STORAGE_KEY = 'tema';

/** Roda no <head>, antes da pintura, para aplicar a escolha gravada sem piscar o tema errado. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
