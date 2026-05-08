// public/js/sidebar-controls.js

function loadSidebarControls(currentMapSpawnTypes, initialSpawnToggleState, initialDarkMode, onChangeCallback) {
    const sidebarPlaceholder = document.getElementById('sidebar-controls-placeholder');
    if (sidebarPlaceholder) {
        let htmlContent = `
            <aside style="background-color: var(--pubg-medium-bg); padding: var(--spacing3); border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); width: 250px; flex-shrink: 0;">
                <div class="dark-mode-toggle-container">
                    <h3 style="color: var(--pubg-text-color);">Map Options</h3>
                    <button id="darkModeToggleButton" class="dark-mode-toggle-button">
                        </button>
                </div>
        `;

        // ... (Der Teil für die Spawn-Typen bleibt unverändert) ...
        for (const typeKey in currentMapSpawnTypes) {
            if (Object.prototype.hasOwnProperty.call(currentMapSpawnTypes, typeKey)) {
                const typeLabel = currentMapSpawnTypes[typeKey];
                const isChecked = initialSpawnToggleState[typeKey] ? 'checked' : '';

                htmlContent += `
                    <div style="margin-bottom: var(--spacing2);">
                        <label style="color: var(--pubg-text-color); display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="toggle-${typeKey}" ${isChecked} style="margin-right: var(--spacing1);" data-spawn-type="${typeKey}" />
                            ${typeLabel}
                        </label>
                    </div>
                `;
            }
        }

        htmlContent += `</aside>`; // Sidebar-End-Tag

        sidebarPlaceholder.innerHTML = htmlContent;

        const darkModeToggleButton = document.getElementById('darkModeToggleButton');
        let currentDarkMode = initialDarkMode; // Zustand für den Toggle-Button

        // Funktion zum Aktualisieren des Icons
        const updateToggleButtonIcon = () => {
            // Setze das src-Attribut des img-Tags auf die Server-Route für das SVG
            darkModeToggleButton.innerHTML = `
                <img src="/icon/${currentDarkMode ? 'moon-solid.svg' : 'sun-solid.svg'}" alt="${currentDarkMode ? 'Moon' : 'Sun'} Icon" />
            `;
        };

        // Initiales Setzen des Icons
        updateToggleButtonIcon();

        // Event-Listener für den Dunkelmodus-Button
        darkModeToggleButton.addEventListener('click', () => {
            currentDarkMode = !currentDarkMode; // Zustand umschalten
            updateToggleButtonIcon(); // Icon aktualisieren
            emitChange(); // Änderung melden
        });

        const emitChange = () => {
            const newSpawnToggleState = {};
            sidebarPlaceholder.querySelectorAll('input[type="checkbox"][data-spawn-type]').forEach(checkbox => {
                const typeKey = checkbox.dataset.spawnType;
                newSpawnToggleState[typeKey] = checkbox.checked;
            });

            const detail = {
                spawnToggleState: newSpawnToggleState,
                darkMode: currentDarkMode
            };
            onChangeCallback({ detail });
        };

        // Event-Listener für alle Spawn-Typ-Checkboxes
        sidebarPlaceholder.querySelectorAll('input[type="checkbox"][data-spawn-type]').forEach(checkbox => {
            checkbox.addEventListener('change', emitChange);
        });
    }
}
