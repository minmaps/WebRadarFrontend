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

    function renderBlips(peds) {
        blipsContainer.innerHTML = ''; // Clear old blips
        entitiesCount.textContent = peds.length;

        peds.forEach(ped => {
            const pos = worldToMapPercentage(ped.x, ped.y);

            const blip = document.createElement("div");
            blip.className = "blip";
            blip.style.left = `${pos.x}%`;
            blip.style.top = `${pos.y}%`;

            // Si on transmet la santé ou le nom, on l'affiche
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

    // Basic map panning (Drag to pan)
    let isDragging = false;
    let startX, startY, scrollLeft, scrollTop;

    const mapViewer = document.getElementById("map-container");

    mapViewer.addEventListener('mousedown', (e) => {
        isDragging = true;
        mapViewer.style.cursor = 'grabbing';
        startX = e.pageX - mapViewer.offsetLeft;
        startY = e.pageY - mapViewer.offsetTop;
        scrollLeft = mapViewer.scrollLeft;
        scrollTop = mapViewer.scrollTop;
    });

    mapViewer.addEventListener('mouseleave', () => {
        isDragging = false;
        mapViewer.style.cursor = 'grab';
    });

    mapViewer.addEventListener('mouseup', () => {
        isDragging = false;
        mapViewer.style.cursor = 'grab';
    });

    mapViewer.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - mapViewer.offsetLeft;
        const y = e.pageY - mapViewer.offsetTop;
        const walkX = (x - startX) * 2; // Scroll-fast
        const walkY = (y - startY) * 2;
        mapViewer.scrollLeft = scrollLeft - walkX;
        mapViewer.scrollTop = scrollTop - walkY;
    });
});
