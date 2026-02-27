document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');

    const roomIdDisplay = document.getElementById("room-id-display");
    const connectionStatus = document.getElementById("connection-status");
    const entitiesCount = document.getElementById("entities-count");
    const blipsContainer = document.getElementById("blips-container");
    const mapImage = document.getElementById("map-image");

    // Customization of map offsets for GTA V 
    // Usually map top-left coordinate x,y down to bottom-right x,y
    // Needs tweaking based on the specific map image used
    const MAP_WORLD_MIN_X = -4000;
    const MAP_WORLD_MAX_X = 4000;
    const MAP_WORLD_MIN_Y = -4000;
    const MAP_WORLD_MAX_Y = 8000;

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

            pusher.connection.bind('connected', () => {
                connectionStatus.textContent = "Connected";
                connectionStatus.className = "connected";
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
        // GTA V coordinates
        // X ranges roughly from -4000 (left) to 4000 (right)
        // Y ranges roughly from -4000 (bottom) to 8000 (top)

        let pctX = (x - MAP_WORLD_MIN_X) / (MAP_WORLD_MAX_X - MAP_WORLD_MIN_X);

        // GTA V Y axis is usually inverted relative to image Y (top is positive in GTA, 0 is top in img)
        let pctY = 1.0 - ((y - MAP_WORLD_MIN_Y) / (MAP_WORLD_MAX_Y - MAP_WORLD_MIN_Y));

        return {
            x: Math.max(0, Math.min(1, pctX)) * 100,
            y: Math.max(0, Math.min(1, pctY)) * 100
        };
    }

    // --- Map Navigation & Tracking ---
    const mapViewer = document.getElementById("map-container");
    const mapWrapper = document.getElementById("map-wrapper");
    const recenterBtn = document.getElementById("recenter-btn");

    let isDragging = false;
    let startX, startY;

    let scale = 3.5; // Default zoom level for 8K map
    let panX = 0;
    let panY = 0;

    // Auto-tracking state (Waze-style)
    let isTracking = true;
    let localPlayerPos = null;

    function disableTracking() {
        if (isTracking) {
            isTracking = false;
            recenterBtn.style.display = "block"; // Show button
        }
    }

    function enableTracking() {
        isTracking = true;
        recenterBtn.style.display = "none"; // Hide button
        centerOnLocalPlayer();
    }

    if (recenterBtn) {
        recenterBtn.addEventListener("click", enableTracking);
    }

    function updateTransform() {
        mapWrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }

    function centerOnLocalPlayer() {
        if (!localPlayerPos || !isTracking) return;

        const imgWidth = mapImage.naturalWidth || 8000;
        const imgHeight = mapImage.naturalHeight || 8000;

        // Convert local player percentage to pixel on the 8K map
        const playerPixelX = (localPlayerPos.x / 100) * imgWidth;
        const playerPixelY = (localPlayerPos.y / 100) * imgHeight;

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

        if (peds.length > 0 && isTracking) {
            // We assume first ped is local player for tracking here. 
            // Can be improved later by finding exactly the local player ID.
            localPlayerPos = worldToMapPercentage(peds[0].x, peds[0].y);
            centerOnLocalPlayer();
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
