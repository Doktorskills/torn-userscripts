// ==UserScript==
// @name         Torn OC Popup Notifier
// @namespace    http://tampermonkey.net/
// @version      1.1.8
// @description  Notifies when you are not in an OC, and lets you set difficulty alerts on the crimes page.
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
    const CHECK_INTERVAL_MS = 490000; // 15 mins
    const STORAGE_KEY_API   = 'torn_api_key';
    const STORAGE_KEY_ALERT = 'torn_oc_alert_difficulty';

    // Statuses considered "active" (i.e. you can be assigned to one)
    const ACTIVE_STATUSES = ['recruiting', 'planning', 'executing'];

    const log  = (msg, data) => data !== undefined ? console.log(`[OC Notifier] ${msg}`, data) : console.log(`[OC Notifier] ${msg}`);
    const warn = (msg, data) => data !== undefined ? console.warn(`[OC Notifier] ${msg}`, data) : console.warn(`[OC Notifier] ${msg}`);
    const err  = (msg, data) => data !== undefined ? console.error(`[OC Notifier] ${msg}`, data) : console.error(`[OC Notifier] ${msg}`);

    let API_KEY   = localStorage.getItem(STORAGE_KEY_API) || '';
    let alertDiff = localStorage.getItem(STORAGE_KEY_ALERT);
    alertDiff = alertDiff !== null ? parseInt(alertDiff) : null;

    let shownNoOC  = false;
    let shownAlert = false;
    let myPlayerId = null;

    // API helper

    function apiGet(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url,
                onload:  (res) => { try { resolve(JSON.parse(res.responseText)); } catch (e) { reject(new Error('JSON parse failed')); } },
                onerror: ()    => reject(new Error('Network error'))
            });
        });
    }

    // Popup modal

    function createModal(message, showInput = false) {
        if (document.getElementById('oc-modal')) return;

        const box = document.createElement('div');
        box.id = 'oc-modal';
        Object.assign(box.style, {
            position: 'fixed', top: '80px', left: '50%',
            transform: 'translateX(-50%)', background: '#fff',
            color: '#000', padding: '15px', borderRadius: '10px',
            width: '300px', zIndex: '999999',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            fontFamily: 'Arial, sans-serif', fontSize: '14px'
        });

        const text = document.createElement('div');
        text.innerText = message;
        text.style.marginBottom = '10px';
        box.appendChild(text);

        if (showInput) {
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Paste API key...';
            input.value = API_KEY;
            Object.assign(input.style, {
                width: '100%', padding: '8px', marginBottom: '10px',
                border: '1px solid #ccc', borderRadius: '6px',
                background: '#fff', color: '#000', boxSizing: 'border-box'
            });
            const save = document.createElement('button');
            save.innerText = 'Save';
            save.style.cssText = 'padding:6px 10px;cursor:pointer;margin-bottom:8px;';
            save.onclick = () => {
                const k = input.value.trim();
                if (!k) return;
                API_KEY = k;
                localStorage.setItem(STORAGE_KEY_API, API_KEY);
                log('API key saved.');
                box.remove();
                shownNoOC = false;
            };
            box.appendChild(input);
            box.appendChild(save);
            box.appendChild(document.createElement('br'));
        }

        const btnClose = document.createElement('button');
        btnClose.innerText = 'Close';
        btnClose.style.cssText = 'margin-top:10px;margin-right:5px;padding:6px 10px;cursor:pointer;';
        btnClose.onclick = () => box.remove();

        const btnGo = document.createElement('button');
        btnGo.innerText = 'Go to OC';
        btnGo.style.cssText = 'margin-top:10px;padding:6px 10px;cursor:pointer;';
        btnGo.onclick = () => { window.location.href = OC_URL; };

        box.appendChild(btnClose);
        box.appendChild(btnGo);
        document.body.appendChild(box);
        log('Modal displayed:', message);
    }

    // Crimes page: notification panel

    function injectCrimesPanel() {
        if (document.getElementById('oc-alert-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'oc-alert-panel';
        Object.assign(panel.style, {
            background: '#2b2b2b',
            color: '#c8c8c8',
            padding: '10px 14px',
            borderRadius: '4px',
            margin: '10px 0',
            fontFamily: 'inherit',
            fontSize: '13px',
            border: '1px solid #3d3d3d',
            width: '784px',
            maxWidth: '100%',
            boxSizing: 'border-box'
        });

        const title = document.createElement('div');
        title.innerText = 'OC Difficulty Alert';
        title.style.cssText = 'font-weight:600;font-size:13px;margin-bottom:8px;color:#e0e0e0;letter-spacing:0.03em;';
        panel.appendChild(title);

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';

        const label = document.createElement('label');
        label.innerText = 'Exact difficulty:';
        label.style.cssText = 'color:#aaa;font-size:13px;';

        const select = document.createElement('select');
        Object.assign(select.style, {
            padding: '3px 8px',
            borderRadius: '3px',
            border: '1px solid #4a4a4a',
            background: '#222',
            color: '#d0d0d0',
            fontSize: '13px',
            cursor: 'pointer'
        });

        const optNone = document.createElement('option');
        optNone.value = '';
        optNone.innerText = 'Off';
        select.appendChild(optNone);

        for (let i = 1; i <= 10; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.innerText = i === 10 ? '10 (max)' : String(i);
            if (alertDiff === i) opt.selected = true;
            select.appendChild(opt);
        }
        if (alertDiff === null) optNone.selected = true;

        const btnSave = document.createElement('button');
        btnSave.innerText = 'Save';
        btnSave.style.cssText = 'padding:3px 12px;cursor:pointer;border-radius:3px;background:#3a3a3a;color:#e0e0e0;border:1px solid #555;font-size:13px;';

        const status = document.createElement('span');
        status.style.cssText = 'color:#888;font-size:12px;margin-left:4px;';
        status.innerText = alertDiff !== null ? `Active (= ${alertDiff})` : 'Inactive';

        btnSave.onclick = () => {
            const val = select.value;
            if (val === '') {
                alertDiff = null;
                localStorage.removeItem(STORAGE_KEY_ALERT);
                status.innerText = 'Inactive';
                shownAlert = false;
                log('Difficulty alert disabled.');
            } else {
                alertDiff = parseInt(val);
                localStorage.setItem(STORAGE_KEY_ALERT, alertDiff);
                status.innerText = `Active (= ${alertDiff})`;
                shownAlert = false;
                log('Difficulty alert set to:', alertDiff);
            }
        };

        row.appendChild(label);
        row.appendChild(select);
        row.appendChild(btnSave);
        row.appendChild(status);
        panel.appendChild(row);

        const content = document.querySelector('#faction-crimes') ||
                        document.querySelector('.content-wrapper') ||
                        document.querySelector('#mainContainer') ||
                        document.body;
        content.insertBefore(panel, content.firstChild);
        log('Crimes page panel injected.');
    }

    // Main check

    async function checkOC() {
        const onCrimesPage = window.location.href.includes('factions.php') &&
                             window.location.href.includes('tab=crimes');

        if (onCrimesPage) injectCrimesPanel();

        if (!API_KEY) {
            if (!shownNoOC) {
                warn('No API key in localStorage.');
                createModal('Missing API key! Please paste your key.', true);
                shownNoOC = true;
            }
            return;
        }

        // Fetch player ID once per session
        if (!myPlayerId) {
            log('Fetching player ID...');
            try {
                const basic = await apiGet(`https://api.torn.com/v2/user?selections=basic&key=${API_KEY}`);
                log('Basic user response:', basic);
                if (basic.error) { err('API error fetching player ID:', basic.error); return; }
                myPlayerId = basic.player_id ?? basic.id
                          ?? basic.profile?.player_id ?? basic.profile?.id;
                if (!myPlayerId) { err('Could not extract player ID:', basic); return; }
                log('My player ID:', myPlayerId);
            } catch (e) {
                err('Failed to fetch player ID:', e.message);
                return;
            }
        }

        // Fetch ALL faction OC crimes
        // v2/user?selections=organizedcrimes only returns OCs that have open
        // slots, so a fully-filled OC you are already assigned to won't appear
        // there. v2/faction?selections=crimes returns every OC regardless of
        // fill status, which is what we need to detect "already in an OC".
        log('Fetching faction crimes...');
        let ocData;
        try {
            ocData = await apiGet(`https://api.torn.com/v2/faction?selections=crimes&key=${API_KEY}`);
        } catch (e) {
            err('Failed to fetch faction crimes:', e.message);
            return;
        }

        log('faction crimes response:', ocData);
        if (ocData.error) { err('API error:', ocData.error); return; }

        // The crimes field may be an array or an object keyed by id
        let allCrimes = ocData.crimes ?? ocData.organizedcrimes;
        if (!allCrimes) { warn('Unexpected response shape:', ocData); return; }
        if (!Array.isArray(allCrimes)) allCrimes = Object.values(allCrimes);

        const activeCrimes = allCrimes.filter(
            c => ACTIVE_STATUSES.includes((c.status ?? '').toLowerCase())
        );
        log(`Active OCs: ${activeCrimes.length} of ${allCrimes.length} total`);

        // Am I already in any active OC?
        let iAmInOC = false;
        for (const crime of activeCrimes) {
            for (const slot of (crime.slots || [])) {
                const uid = slot.user?.id ?? slot.user?.player_id;
                if (uid === myPlayerId) {
                    log(`Already in OC "${crime.name}" (${crime.status}) as ${slot.position}.`);
                    iAmInOC = true;
                    break;
                }
            }
            if (iAmInOC) break;
        }

        // Generic "join an OC" popup
        if (!iAmInOC && !shownNoOC && !onCrimesPage && alertDiff === null) {
            log('Not in any OC and no difficulty alert set – showing join popup.');
            createModal('Join an OC!');
            shownNoOC = true;
        } else if (iAmInOC) {
            log('Already in an OC – no popup needed.');
            shownNoOC = true;
        } else if (!iAmInOC && alertDiff !== null) {
            log('Not in OC but difficulty alert is active – skipping generic popup.');
        }

        // Difficulty alert (only fires when NOT already in an OC)
        if (!iAmInOC && alertDiff !== null && !shownAlert && !onCrimesPage) {
            const openCrimes = activeCrimes.filter(c => (c.slots || []).some(s => !s.user));
            for (const crime of openCrimes) {
                const diff = crime.difficulty ?? 0;
                log(`Checking: "${crime.name}" (${crime.status}) diff=${diff}`);
                if (diff === alertDiff) {
                    log(`Alert triggered for "${crime.name}" (diff ${diff})`);
                    createModal(`OC Alert: "${crime.name}" (difficulty ${diff}) has an open slot!`);
                    shownAlert = true;
                    break;
                }
            }
        }
    }

    //  Page navigation observer (Torn is a SPA)

    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            log('Navigated to:', lastUrl);
            if (lastUrl.includes('factions.php') && lastUrl.includes('tab=crimes')) {
                setTimeout(injectCrimesPanel, 1500);
            }
        }
    }).observe(document.body, { subtree: true, childList: true });

    // Init

    log('Starting OC Notifier' + version);
    log(`Check interval: ${CHECK_INTERVAL_MS / 1000}s`);
    log('API key in localStorage:', API_KEY ? 'YES (hidden)' : 'NO');
    log('Difficulty alert:', alertDiff !== null ? `= ${alertDiff}` : 'Off');

    setTimeout(checkOC, 3000);
    setInterval(checkOC, CHECK_INTERVAL_MS);

})();
