// ==UserScript==
// @name         Torn OC Popup Notifier
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Script to remember OC (v2 API)
// @author       DoktorSkills [2275097]
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/Doktorskills/torn-userscripts/main/oc-notifier.user.js
// @downloadURL  https://raw.githubusercontent.com/Doktorskills/torn-userscripts/main/oc-notifier.user.js
// ==/UserScript==

(function () {
    'use strict';

    const OC_URL = "https://www.torn.com/factions.php?step=your#/tab=crimes";
    const CHECK_INTERVAL_MS = 30000; // 30 sekunder

    const log = (msg, data) => {
        if (data !== undefined) {
            console.log(`[OC Notifier] ${msg}`, data);
        } else {
            console.log(`[OC Notifier] ${msg}`);
        }
    };

    const warn = (msg, data) => {
        if (data !== undefined) {
            console.warn(`[OC Notifier] ${msg}`, data);
        } else {
            console.warn(`[OC Notifier] ${msg}`);
        }
    };

    const error = (msg, data) => {
        if (data !== undefined) {
            console.error(`[OC Notifier] ${msg}`, data);
        } else {
            console.error(`[OC Notifier] ${msg}`);
        }
    };

    let API_KEY = localStorage.getItem('torn_api_key') || '';
    let shown = false;

    function createModal(message, showInput = false) {
        if (document.getElementById('oc-modal')) {
            log('Modal allerede åpen, hopper over.');
            return;
        }

        const box = document.createElement('div');
        box.id = 'oc-modal';

        box.style.position = 'fixed';
        box.style.top = '80px';
        box.style.left = '50%';
        box.style.transform = 'translateX(-50%)';
        box.style.background = '#ffffff';
        box.style.color = '#000';
        box.style.padding = '15px';
        box.style.borderRadius = '10px';
        box.style.width = '300px';
        box.style.zIndex = '999999';
        box.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
        box.style.fontFamily = 'Arial, sans-serif';

        const text = document.createElement('div');
        text.innerText = message;
        text.style.marginBottom = '10px';
        box.appendChild(text);

        if (showInput) {
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Lim inn API-nøkkel...';
            input.value = API_KEY;

            input.style.width = '100%';
            input.style.padding = '8px';
            input.style.marginBottom = '10px';
            input.style.border = '1px solid #ccc';
            input.style.borderRadius = '6px';
            input.style.background = '#fff';
            input.style.color = '#000';
            input.style.boxSizing = 'border-box';

            const save = document.createElement('button');
            save.innerText = 'Lagre';
            save.style.padding = '6px 10px';
            save.style.cursor = 'pointer';

            save.onclick = () => {
                const newKey = input.value.trim();
                if (!newKey) {
                    warn('Forsøkte å lagre tom API-nøkkel.');
                    return;
                }
                API_KEY = newKey;
                localStorage.setItem('torn_api_key', API_KEY);
                log('API-nøkkel lagret.');
                box.remove();
                shown = false;
            };

            box.appendChild(input);
            box.appendChild(save);
        }

        const btnClose = document.createElement('button');
        btnClose.innerText = 'Lukk';
        btnClose.style.marginTop = '10px';
        btnClose.style.marginRight = '5px';
        btnClose.style.padding = '6px 10px';
        btnClose.style.cursor = 'pointer';
        btnClose.onclick = () => {
            log('Modal lukket av bruker.');
            box.remove();
        };

        const btnGo = document.createElement('button');
        btnGo.innerText = 'Gå til OC';
        btnGo.style.marginTop = '10px';
        btnGo.style.padding = '6px 10px';
        btnGo.style.cursor = 'pointer';
        btnGo.onclick = () => {
            log('Navigerer til OC-siden.');
            window.location.href = OC_URL;
        };

        box.appendChild(document.createElement('br'));
        box.appendChild(btnClose);
        box.appendChild(btnGo);

        document.body.appendChild(box);
        log('Modal vist:', message);
    }

    function checkOC() {
        if (shown) {
            log('Sjekk hoppet over - modal allerede vist denne sesjonen.');
            return;
        }

        if (window.location.href.includes('factions.php') &&
            window.location.href.includes('tab=crimes')) {
            log('Allerede på OC-siden, ingen modal nødvendig.');
            return;
        }

        if (!API_KEY) {
            warn('Ingen API-nøkkel funnet i localStorage.');
            createModal('Mangler API-nøkkel! Lim inn nøkkelen din.', true);
            shown = true;
            return;
        }

        log('Henter OC-data fra Torn v2 API...');

        GM_xmlhttpRequest({
            method: "GET",
            url: `https://api.torn.com/v2/faction/crimes?key=${API_KEY}`,
            onload: function (res) {
                log('API-svar mottatt. HTTP-status:', res.status);

                let data;
                try {
                    data = JSON.parse(res.responseText);
                } catch (e) {
                    error('Kunne ikke parse JSON fra API:', res.responseText);
                    return;
                }

                log('Rådata fra API:', data);

                // Feilsjekk
                if (data.error) {
                    error('API returnerte feil:', data.error);
                    createModal(`API-feil: ${data.error.error || JSON.stringify(data.error)}`, true);
                    shown = true;
                    return;
                }

                // v2 returnerer { crimes: [...] } som en liste
                const crimes = data.crimes;

                if (!crimes || !Array.isArray(crimes)) {
                    warn('Ingen crimes-array i responsen:', data);
                    return;
                }

                log(`Fant ${crimes.length} OC(er) i fraksjonen.`);

                // Finn OCs der time_left er 0 og statusen er "recruiting" (klar til å bli med)
                // eller der bruker ikke er tildelt ennå
                let readyOC = null;

                for (const crime of crimes) {
                    log(`OC: "${crime.name}" | status: ${crime.status} | time_left: ${crime.time_left} | slots:`, crime.slots);

                    // Sjekk om det er en ledig slot (participant med null user)
                    const hasOpenSlot = crime.slots && crime.slots.some(slot => slot.user === null || slot.user === undefined);

                    if (crime.status === 'recruiting' || hasOpenSlot) {
                        log(`→ OC "${crime.name}" har ledig plass eller rekrutterer!`);
                        readyOC = crime;
                        break;
                    }

                    // Sjekk time_left for planning-fasen (klar til å starte)
                    if (crime.time_left === 0 && crime.status !== 'completed') {
                        log(`→ OC "${crime.name}" er klar til å kjøres (time_left = 0)!`);
                        readyOC = crime;
                        break;
                    }
                }

                if (readyOC) {
                    log('Viser modal for OC:', readyOC.name);
                    createModal(`OC klar: "${readyOC.name}" – bli med nå!`);
                    shown = true;
                } else {
                    log('Ingen OC-er trenger handling akkurat nå.');
                }
            },
            onerror: function (res) {
                error('Nettverksfeil ved API-kall:', res);
            }
        });
    }

    log('Starter OC Notifier v2.0.0');
    log(`Sjekker hvert ${CHECK_INTERVAL_MS / 1000} sekund.`);
    log('API-nøkkel lastet fra localStorage:', API_KEY ? 'JA (skjult)' : 'NEI');

    // Første sjekk etter 3 sekunder (vent på at siden laster)
    setTimeout(checkOC, 3000);
    setInterval(checkOC, CHECK_INTERVAL_MS);

})();
