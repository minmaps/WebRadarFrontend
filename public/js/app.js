document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');

    const roomIdDisplay = document.getElementById("room-id-display");
    const connectionStatus = document.getElementById("connection-status");
    const entitiesCount = document.getElementById("entities-count");
    const blipsContainer = document.getElementById("blips-container");
    const mapImage = document.getElementById("map-image");

    const showDetectionZoneCheckbox = document.getElementById("show-detection-zone");
    const detectionZone = document.getElementById("detection-zone");
    const mapTypeSelect = document.getElementById("map-type-select");

    if (mapTypeSelect && mapImage) {
        mapTypeSelect.addEventListener("change", (e) => {
            mapImage.src = e.target.value;
        });
    }

    if (showDetectionZoneCheckbox && detectionZone) {
        showDetectionZoneCheckbox.addEventListener("change", (e) => {
            detectionZone.style.display = e.target.checked ? "block" : "none";
        });
    }

    // Calibration Constants (computed from 2 reference points)
    // Point A: In-game X: -930.37, Y: -3579.83 -> Image U: 3141, V: 7878
    // Point B: In-game X: 54.13, Y: 7253.7 -> Image U: 3791, V: 748
    const mapPixelWidth = 8192;
    const mapPixelHeight = 8192;

    const scaleX = 0.6602336; // (3791 - 3141) / (54.13 - (-930.37))
    const scaleY = 0.6581419; // (748 - 7878) / (-3579.83 - 7253.7)

    let offsetX = 3755.2615; // 3141 - (scaleX * -930.37)
    let offsetY = 5521.9638; // 7878 + (scaleY * -3579.83)

    if (!room) {
        roomIdDisplay.textContent = "NO ROOM PROVIDED";
        roomIdDisplay.style.color = "red";
        return;
    }

    roomIdDisplay.textContent = room;
    connectionStatus.textContent = "Connecting...";
    connectionStatus.className = "connecting";

    // Initialize Pusher
    // We get NEXT_PUBLIC_PUSHER_KEY and NEXT_PUBLIC_PUSHER_CLUSTER injected by Vercel's env somehow? 
    // Actually, in vanilla JS static hosting on Vercel, we can't easily inject env vars into static JS files without a bundler.
    // So we need to fetch the configuration from a simple API endpoint first!

    fetch('/api/config')
        .then(res => res.json())
        .then(config => {
            const pusher = new Pusher(config.pusherKey, {
                cluster: config.pusherCluster
            });

            let dataTimeout = null;

            pusher.connection.bind('connected', () => {
                connectionStatus.textContent = "Waiting for data...";
                connectionStatus.className = "connecting";
            });

            pusher.connection.bind('disconnected', () => {
                connectionStatus.textContent = "Disconnected";
                connectionStatus.className = "disconnected";
            });

            pusher.connection.bind('error', () => {
                connectionStatus.textContent = "Error";
                connectionStatus.className = "disconnected";
            });

            const channel = pusher.subscribe(`webradar-${room}`);

            channel.bind('update_map', (data) => {
                if (data && data.peds) {
                    connectionStatus.textContent = "Connected (Receiving Data)";
                    connectionStatus.className = "connected";

                    if (dataTimeout) clearTimeout(dataTimeout);
                    dataTimeout = setTimeout(() => {
                        connectionStatus.textContent = "Waiting for data...";
                        connectionStatus.className = "connecting";
                    }, 3000);

                    renderBlips(data.peds);
                }
            });
        })
        .catch(err => {
            connectionStatus.textContent = "Error fetching config";
            connectionStatus.className = "disconnected";
            console.error("Config error:", err);
        });

    function worldToMapPercentage(x, y) {
        // Calculate pixel positions based on scale and offset
        // X axis is identical.
        let pxX = offsetX + (x * scaleX);
        // GTA V Y axis points North (positive). Image V axis points South (positive).
        let pxY = offsetY - (y * scaleY);

        let pctX = pxX / mapPixelWidth;
        let pctY = pxY / mapPixelHeight;

        return {
            x: Math.max(0, Math.min(1, pctX)) * 100,
            y: Math.max(0, Math.min(1, pctY)) * 100
        };
    }

    // Calibration mode
    window.calibrateMapX = function (newOffset) {
        if (newOffset !== undefined) offsetX = newOffset;
        console.log(`New Offset X: ${offsetX}`);
    };
    window.calibrateMapY = function (newOffset) {
        if (newOffset !== undefined) offsetY = newOffset;
        console.log(`New Offset Y: ${offsetY}`);
    };

    // --- Map Navigation & Tracking ---
    const mapViewer = document.getElementById("map-container");
    const mapWrapper = document.getElementById("map-wrapper");
    const recenterBtn = document.getElementById("recenter-btn");
    const playerFollowSelect = document.getElementById("player-follow-select");

    let isDragging = false;
    let startX, startY;

    let scale = 3.5; // Default zoom level for 8K map
    let panX = 0;
    let panY = 0;

    // Auto-tracking state (Waze-style)
    let isTracking = true;
    let trackedPlayerPos = null;

    function disableTracking() {
        if (isTracking) {
            isTracking = false;
            recenterBtn.style.display = "block"; // Show button
        }
    }

    function enableTracking() {
        isTracking = true;
        recenterBtn.style.display = "none"; // Hide button
        centerOnTargetPlayer();
    }

    if (playerFollowSelect) {
        playerFollowSelect.addEventListener("change", () => {
            enableTracking(); // Instantly center on the newly selected player
        });
    }

    if (recenterBtn) {
        recenterBtn.addEventListener("click", enableTracking);
    }

    function updateTransform() {
        mapWrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }

    function centerOnTargetPlayer() {
        if (!trackedPlayerPos || !isTracking) return;

        const imgWidth = mapImage.naturalWidth || 8000;
        const imgHeight = mapImage.naturalHeight || 8000;

        // Convert target player percentage to pixel on the 8K map
        const playerPixelX = (trackedPlayerPos.x / 100) * imgWidth;
        const playerPixelY = (trackedPlayerPos.y / 100) * imgHeight;

        // Calculate pan needed to center this pixel on screen
        // We use scale to ensure the center point is accurate regardless of zoom
        panX = (window.innerWidth / 2) - (playerPixelX * scale);
        panY = (window.innerHeight / 2) - (playerPixelY * scale);

        updateTransform();
    }

    // Try to center the map on initial load (assuming the image is huge like 8000x8000)
    window.addEventListener('load', () => {
        const imgWidth = mapImage.naturalWidth || 8000;
        const imgHeight = mapImage.naturalHeight || 8000;
        panX = (window.innerWidth / 2) - (imgWidth * scale / 2);
        panY = (window.innerHeight / 2) - (imgHeight * scale / 2);
        updateTransform();
    });

    mapViewer.addEventListener('mousedown', (e) => {
        if (e.target.closest('#ui-overlay')) return; // Ignore drag if clicking UI
        isDragging = true;

        // Remove scale factoring here, we just need raw delta from mousedown point
        startX = e.clientX - panX;
        startY = e.clientY - panY;
    });

    mapViewer.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    mapViewer.addEventListener('mouseup', () => {
        isDragging = false;
    });

    mapViewer.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        // If user manually drags, break auto-tracking
        disableTracking();

        e.preventDefault();
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        updateTransform();
    });

    mapViewer.addEventListener('wheel', (e) => {
        if (e.target.closest('#ui-overlay')) return; // Ignore wheel if on UI
        e.preventDefault(); // Prevent page scroll

        // If user manually zooms, break auto-tracking
        disableTracking();

        const zoomIntensity = 0.002;
        let zoomExp = Math.exp(-e.deltaY * zoomIntensity);
        let newScale = scale * zoomExp;

        // Limits
        const minScale = 0.5;
        const maxScale = 25.0; // High max scale for 8K map details
        newScale = Math.max(minScale, Math.min(newScale, maxScale));

        // Calculate new pan to zoom exactly under the mouse cursor
        const rect = mapViewer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        panX = mouseX - (mouseX - panX) * (newScale / scale);
        panY = mouseY - (mouseY - panY) * (newScale / scale);

        scale = newScale;
        updateTransform();
    }, { passive: false });

    // --- Render Logic ---
    function renderBlips(peds) {
        blipsContainer.innerHTML = ''; // Clear old blips

        if (entitiesCount) {
            entitiesCount.textContent = peds.length;
        }

        // --- Player Selection Dropdown Logic ---
        if (playerFollowSelect) {
            const currentSelection = playerFollowSelect.value;
            // Clear existing options except "local"
            playerFollowSelect.innerHTML = '<option value="local">Local Player</option>';

            // Re-populate options
            peds.forEach((ped, index) => {
                if (index === 0) return; // Skip local player (already covered by "local")
                if (ped.name && ped.id !== "0") {
                    const option = document.createElement("option");
                    option.value = ped.id;
                    option.textContent = ped.name;
                    playerFollowSelect.appendChild(option);
                }
            });

            // Restore selection if it still exists
            const optionExists = Array.from(playerFollowSelect.options).some(opt => opt.value === currentSelection);
            if (optionExists) {
                playerFollowSelect.value = currentSelection;
            } else {
                playerFollowSelect.value = "local"; // Fallback to local if player disconnected
            }
        }
        // ----------------------------------------

        if (peds.length > 0) {
            const localPlayer = peds[0]; // Default to local player

            // Update detection zone position
            if (detectionZone && localPlayer) {
                const localPos = worldToMapPercentage(localPlayer.x, localPlayer.y);
                detectionZone.style.left = `${localPos.x}%`;
                detectionZone.style.top = `${localPos.y}%`;
            }

            const selectedId = playerFollowSelect ? playerFollowSelect.value : "local";
            let targetPed = localPlayer;

            if (selectedId !== "local") {
                const foundPed = peds.find(p => p.id === selectedId);
                if (foundPed) {
                    targetPed = foundPed;
                }
            }

            trackedPlayerPos = worldToMapPercentage(targetPed.x, targetPed.y);

            if (isTracking) {
                centerOnTargetPlayer();
            }
        }

        peds.forEach(ped => {
            const pos = worldToMapPercentage(ped.x, ped.y);

            const blip = document.createElement("div");
            blip.className = "blip";
            blip.style.left = `${pos.x}%`;
            blip.style.top = `${pos.y}%`;

            if (ped.health !== undefined) {
                if (ped.health <= 0) {
                    blip.classList.add("dead");
                } else if (ped.health < 50) {
                    blip.classList.add("low-hp");
                }
            }

            if (ped.name) {
                const label = document.createElement("div");
                label.className = "blip-label";
                label.textContent = ped.name;
                blip.appendChild(label);
            }

            blipsContainer.appendChild(blip);
        });
    }
});
