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

    const mapPixelWidth = 8192;
    const mapPixelHeight = 8192;

    const scaleX = 0.6602336;
    const scaleY = 0.6581419;

    let offsetX = 3755.2615;
    let offsetY = 5521.9638;

    if (!room) {
        roomIdDisplay.textContent = "NO ROOM PROVIDED";
        roomIdDisplay.style.color = "red";
        return;
    }

    roomIdDisplay.textContent = room;
    connectionStatus.textContent = "Connecting...";
    connectionStatus.className = "connecting";

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
        let pxX = offsetX + (x * scaleX);
        let pxY = offsetY - (y * scaleY);

        let pctX = pxX / mapPixelWidth;
        let pctY = pxY / mapPixelHeight;

        return {
            x: Math.max(0, Math.min(1, pctX)) * 100,
            y: Math.max(0, Math.min(1, pctY)) * 100
        };
    }

    window.calibrateMapX = function (newOffset) {
        if (newOffset !== undefined) offsetX = newOffset;
        console.log(`New Offset X: ${offsetX}`);
    };
    window.calibrateMapY = function (newOffset) {
        if (newOffset !== undefined) offsetY = newOffset;
        console.log(`New Offset Y: ${offsetY}`);
    };

    const mapViewer = document.getElementById("map-container");
    const mapWrapper = document.getElementById("map-wrapper");
    const recenterBtn = document.getElementById("recenter-btn");
    const playerFollowSelect = document.getElementById("player-follow-select");

    let isDragging = false;
    let startX, startY;

    let scale = 3.5;
    let panX = 0;
    let panY = 0;

    let isTracking = true;
    let trackedPlayerPos = null;

    function disableTracking() {
        if (isTracking) {
            isTracking = false;
            recenterBtn.style.display = "block";
        }
    }

    function enableTracking() {
        isTracking = true;
        recenterBtn.style.display = "none";
        centerOnTargetPlayer();
    }

    if (playerFollowSelect) {
        playerFollowSelect.addEventListener("change", () => {
            enableTracking();
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

        const playerPixelX = (trackedPlayerPos.x / 100) * imgWidth;
        const playerPixelY = (trackedPlayerPos.y / 100) * imgHeight;

        panX = (window.innerWidth / 2) - (playerPixelX * scale);
        panY = (window.innerHeight / 2) - (playerPixelY * scale);

        updateTransform();
    }

    window.addEventListener('load', () => {
        const imgWidth = mapImage.naturalWidth || 8000;
        const imgHeight = mapImage.naturalHeight || 8000;
        panX = (window.innerWidth / 2) - (imgWidth * scale / 2);
        panY = (window.innerHeight / 2) - (imgHeight * scale / 2);
        updateTransform();
    });

    mapViewer.addEventListener('mousedown', (e) => {
        if (e.target.closest('#ui-overlay')) return;
        isDragging = true;

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

        disableTracking();

        e.preventDefault();
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        updateTransform();
    });

    mapViewer.addEventListener('wheel', (e) => {
        if (e.target.closest('#ui-overlay')) return;
        e.preventDefault();

        disableTracking();

        const zoomIntensity = 0.002;
        let zoomExp = Math.exp(-e.deltaY * zoomIntensity);
        let newScale = scale * zoomExp;

        const minScale = 0.5;
        const maxScale = 25.0;
        newScale = Math.max(minScale, Math.min(newScale, maxScale));

        const rect = mapViewer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        panX = mouseX - (mouseX - panX) * (newScale / scale);
        panY = mouseY - (mouseY - panY) * (newScale / scale);

        scale = newScale;
        updateTransform();
    }, { passive: false });

    function renderBlips(peds) {
        blipsContainer.innerHTML = '';

        if (entitiesCount) {
            entitiesCount.textContent = peds.length;
        }

        if (playerFollowSelect) {
            const currentSelection = playerFollowSelect.value;
            playerFollowSelect.innerHTML = '<option value="local">Local Player</option>';

            peds.forEach((ped, index) => {
                if (index === 0) return;
                if (ped.name && ped.id !== "0") {
                    const option = document.createElement("option");
                    option.value = ped.id;
                    option.textContent = ped.name;
                    playerFollowSelect.appendChild(option);
                }
            });

            const optionExists = Array.from(playerFollowSelect.options).some(opt => opt.value === currentSelection);
            if (optionExists) {
                playerFollowSelect.value = currentSelection;
            } else {
                playerFollowSelect.value = "local";
            }
        }

        if (peds.length > 0) {
            const localPlayer = peds[0];

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
