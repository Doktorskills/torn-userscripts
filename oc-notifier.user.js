// ==UserScript==
// @name         Torn OC Popup Notifier
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Script to remember OC
// @author       DoktorSkills [2275097]
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @licence      MIT
// @updateURL    https://raw.githubusercontent.com/Doktorskills/torn-userscripts/main/oc-notifier.user.js
// @downloadURL  https://raw.githubusercontent.com/Doktorskills/torn-userscripts/main/oc-notifier.user.js
// ==/UserScript==

(function () {
    'use strict';

    const OC_URL = "https://www.torn.com/factions.php?step=your#/tab=crimes";
    const TEST_MODE = false;

    let API_KEY = localStorage.getItem('torn_api_key') || '';
    let shown = false;

    function createModal(message, showInput = false) {
        if (document.getElementById('oc-modal')) return;

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
            input.placeholder = 'Paste API key...';
            input.value = API_KEY;

            input.style.width = '100%';
            input.style.padding = '8px';
            input.style.marginBottom = '10px';
            input.style.border = '1px solid #ccc';
            input.style.borderRadius = '6px';
            input.style.background = '#fff';
            input.style.color = '#000';

            const save = document.createElement('button');
            save.innerText = 'Save';
            save.style.padding = '6px 10px';
            save.style.cursor = 'pointer';

            save.onclick = () => {
                API_KEY = input.value.trim();
                localStorage.setItem('torn_api_key', API_KEY);
                box.remove();
                shown = false;
            };

            box.appendChild(input);
            box.appendChild(save);
        }

        const btnClose = document.createElement('button');
        btnClose.innerText = 'Close';
        btnClose.style.marginTop = '10px';
        btnClose.style.marginRight = '5px';
        btnClose.style.padding = '6px 10px';
        btnClose.style.cursor = 'pointer';

        btnClose.onclick = () => box.remove();

        const btnGo = document.createElement('button');
        btnGo.innerText = 'Go to OC';
        btnGo.style.marginTop = '10px';
        btnGo.style.padding = '6px 10px';
        btnGo.style.cursor = 'pointer';

        btnGo.onclick = () => {
            window.location.href = OC_URL;
        };

        box.appendChild(document.createElement('br'));
        box.appendChild(btnClose);
        box.appendChild(btnGo);

        document.body.appendChild(box);
    }

    function checkOC() {
        if (shown) return;

        if (window.location.href.includes('factions.php') &&
            window.location.href.includes('tab=crimes')) {
            return;
        }

        if (!API_KEY) {
            createModal('Missing API key!', true);
            shown = true;
            return;
        }
        
        if (TEST_MODE) {
            createModal('Join an OC!');
            shown = true;
            return;
        }

        GM_xmlhttpRequest({
            method: "GET",
            url: `https://api.torn.com/faction/?selections=crimes&key=${API_KEY}`,
            onload: function (res) {
                const data = JSON.parse(res.responseText);

                if (data.error) {
                    createModal('API Error: ' + data.error.error, true);
                    shown = true;
                    return;
                }

                const crimes = data.crimes;

                for (let id in crimes) {
                    const crime = crimes[id];

                    if (crime.time_left === 0) {
                        createModal('Join an OC!');
                        shown = true;
                        return;
                    }
                }
            }
        });
    }

    setInterval(checkOC, 30000); // Updates every 30 seconds, change if seen necessary.

})();
